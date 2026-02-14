/* ============================================
   SnapRead — File Parsing Engine
   Unified pipeline: File → Text → Word Array
   Supports: EPUB, PDF, TXT, MD
   ============================================ */

class FileParser {
    constructor() {
        this.supportedTypes = ['.epub', '.pdf', '.txt', '.md', '.text', '.markdown'];
    }

    /**
     * Parse a file and return a structured document object.
     * @param {File} file - The file from the file input
     * @returns {Promise<Object>} Parsed document
     */
    /**
     * Parse a file or buffer and return a structured document object.
     * @param {File|ArrayBuffer} input - Not output
     * @param {string} [filename] - Required if input is ArrayBuffer
     * @returns {Promise<Object>} Parsed document
     */
    async parse(input, filename) {
        let buffer;
        let name;

        if (input instanceof Blob) {
            buffer = await input.arrayBuffer();
            name = input.name || filename;
        } else {
            buffer = input;
            name = filename;
        }

        const ext = this._getExtension(name);

        switch (ext) {
            case '.epub':
                return await this._parseEpub(buffer, name);
            case '.pdf':
                return await this._parsePdf(buffer, name);
            case '.txt':
            case '.text':
                return await this._parsePlainText(buffer, name);
            case '.md':
            case '.markdown':
                return await this._parseMarkdown(buffer, name);
            default:
                throw new Error(`Unsupported file type: ${ext}`);
        }
    }

    /**
     * Get the file extension
     */
    _getExtension(filename) {
        if (!filename) return '';
        const idx = filename.lastIndexOf('.');
        return idx >= 0 ? filename.substring(idx).toLowerCase() : '';
    }

    /**
     * Parse EPUB
     */
    async _parseEpub(buffer, filename) {
        const book = ePub(buffer);
        await book.ready;

        const metadata = book.packaging.metadata;
        const spine = book.spine;
        const chapters = [];
        let allText = '';
        let allWords = [];

        // Iterate through spine items to extract text
        for (let i = 0; i < spine.items.length; i++) {
            const item = spine.items[i];
            try {
                const doc = await book.load(item.href);

                // doc is a Document object, extract text
                let chapterText = '';
                if (doc && doc.body) {
                    chapterText = this._extractTextFromNode(doc.body);
                } else if (doc && doc.documentElement) {
                    chapterText = this._extractTextFromNode(doc.documentElement);
                } else if (typeof doc === 'string') {
                    chapterText = this._stripHtml(doc);
                }

                chapterText = chapterText.trim();
                if (chapterText.length === 0) continue;

                const chapterWords = this._tokenize(chapterText);

                chapters.push({
                    title: item.label || `Chapter ${chapters.length + 1}`,
                    startWordIndex: allWords.length,
                    wordCount: chapterWords.length,
                });

                allWords = allWords.concat(chapterWords);
                allText += chapterText + '\n\n';
            } catch (err) {
                console.warn(`Failed to load chapter ${item.href}:`, err);
                // Continue to next chapter
            }
        }

        book.destroy();

        return {
            title: metadata.title || filename.replace(/\.epub$/i, ''),
            author: metadata.creator || '',
            chapters,
            words: allWords,
            fullText: allText.trim(),
            format: 'epub',
            wordCount: allWords.length,
        };
    }

    /**
     * Parse PDF
     */
    async _parsePdf(buffer, filename) {
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

        let allText = '';
        let allWords = [];
        const chapters = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map(item => item.str)
                .join(' ')
                .trim();

            if (pageText.length === 0) continue;

            // Treat each page as a rough "chapter" for navigation
            if (pageNum === 1 || pageNum % 10 === 0) {
                chapters.push({
                    title: `Page ${pageNum}`,
                    startWordIndex: allWords.length,
                });
            }

            const pageWords = this._tokenize(pageText);
            allWords = allWords.concat(pageWords);
            allText += pageText + '\n\n';
        }

        // Extract metadata
        let title = filename.replace(/\.pdf$/i, '');
        let author = '';
        try {
            const meta = await pdf.getMetadata();
            if (meta.info) {
                title = meta.info.Title || title;
                author = meta.info.Author || '';
            }
        } catch (_) { /* ignore metadata errors */ }

        return {
            title,
            author,
            chapters,
            words: allWords,
            fullText: allText.trim(),
            format: 'pdf',
            wordCount: allWords.length,
        };
    }

    /**
     * Parse plain text
     */
    async _parsePlainText(buffer, filename) {
        const text = new TextDecoder().decode(buffer);
        const words = this._tokenize(text);
        const chapters = this._detectChapters(text, words);

        return {
            title: filename.replace(/\.(txt|text)$/i, ''),
            author: '',
            chapters,
            words,
            fullText: text,
            format: 'txt',
            wordCount: words.length,
        };
    }

    /**
     * Parse Markdown
     */
    async _parseMarkdown(buffer, filename) {
        const rawText = new TextDecoder().decode(buffer);
        const strippedText = this._stripMarkdown(rawText);
        const words = this._tokenize(strippedText);
        const chapters = this._detectMarkdownHeadings(rawText, strippedText, words);

        return {
            title: filename.replace(/\.(md|markdown)$/i, ''),
            author: '',
            chapters,
            words,
            fullText: rawText,
            fullTextStripped: strippedText,
            format: 'md',
            wordCount: words.length,
        };
    }

    // --- Text Processing Utilities ---

    /**
     * Tokenize text into words array, preserving punctuation attached to words
     */
    _tokenize(text) {
        return text
            .replace(/\r\n/g, '\n')
            .split(/\s+/)
            .filter(w => w.length > 0);
    }

    /**
     * Extract text from a DOM node recursively
     */
    _extractTextFromNode(node) {
        let text = '';
        if (node.nodeType === 3) { // Text node
            text += node.textContent;
        } else if (node.nodeType === 1) { // Element node
            const tag = node.tagName?.toLowerCase();
            // Add line breaks for block elements
            if (['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tag)) {
                text += '\n';
            }
            for (const child of node.childNodes) {
                text += this._extractTextFromNode(child);
            }
            if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tag)) {
                text += '\n';
            }
        }
        return text;
    }

    /**
     * Strip HTML tags from a string
     */
    _stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    /**
     * Strip Markdown syntax for clean RSVP reading
     */
    _stripMarkdown(md) {
        return md
            // Headers
            .replace(/^#{1,6}\s+/gm, '')
            // Bold/italic
            .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
            // Strikethrough
            .replace(/~~(.*?)~~/g, '$1')
            // Links [text](url) -> text
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            // Images ![alt](url) -> alt
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            // Inline code
            .replace(/`([^`]+)`/g, '$1')
            // Code blocks
            .replace(/```[\s\S]*?```/g, '')
            // Blockquotes
            .replace(/^\s*>\s+/gm, '')
            // Horizontal rules
            .replace(/^[-*_]{3,}\s*$/gm, '')
            // List markers
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            // Clean up extra whitespace
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * Detect chapter-like headings in plain text
     */
    _detectChapters(text, words) {
        const chapters = [];
        const lines = text.split('\n');
        let wordIndex = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            // Detect "Chapter X" or all-caps lines as chapter markers
            if (/^(chapter|part|section)\s+\d+/i.test(trimmed) ||
                (trimmed.length > 3 && trimmed.length < 60 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed))) {
                chapters.push({
                    title: trimmed.length > 40 ? trimmed.substring(0, 40) + '…' : trimmed,
                    startWordIndex: wordIndex,
                });
            }
            const lineWords = trimmed.split(/\s+/).filter(w => w.length > 0);
            wordIndex += lineWords.length;
        }

        if (chapters.length === 0) {
            chapters.push({ title: 'Start', startWordIndex: 0 });
        }

        return chapters;
    }

    /**
     * Detect markdown headings as chapters
     */
    _detectMarkdownHeadings(rawMd, strippedText, words) {
        const chapters = [];
        const lines = rawMd.split('\n');
        let wordIndex = 0;

        for (const line of lines) {
            const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
            if (headingMatch) {
                chapters.push({
                    title: headingMatch[2].trim(),
                    startWordIndex: wordIndex,
                    level: headingMatch[1].length,
                });
            }
            // Count words in stripped version of this line
            const stripped = this._stripMarkdown(line).trim();
            if (stripped) {
                wordIndex += stripped.split(/\s+/).filter(w => w.length > 0).length;
            }
        }

        if (chapters.length === 0) {
            chapters.push({ title: 'Start', startWordIndex: 0 });
        }

        return chapters;
    }
}

// Export singleton
const fileParser = new FileParser();
