// tests/markdown.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { convertMarkdownToRequests } from '../dist/markdownToGoogleDocs.js';

describe('Markdown Conversion', () => {
  describe('Basic Text Formatting', () => {
    it('should convert bold text', () => {
      const markdown = '**bold text**';
      const requests = convertMarkdownToRequests(markdown, 1);

      // Should have insert request
      const insertReq = requests.find(r => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.text, 'bold text');

      // Should have formatting request
      const styleReq = requests.find(r => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.bold, true);
    });

    it('should convert italic text', () => {
      const markdown = '*italic text*';
      const requests = convertMarkdownToRequests(markdown, 1);

      const styleReq = requests.find(r => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.italic, true);
    });

    it('should convert strikethrough text', () => {
      const markdown = '~~strikethrough text~~';
      const requests = convertMarkdownToRequests(markdown, 1);

      const styleReq = requests.find(r => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.strikethrough, true);
    });

    it('should convert nested bold and italic', () => {
      const markdown = '***bold italic***';
      const requests = convertMarkdownToRequests(markdown, 1);

      const styleReq = requests.find(r => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.bold, true);
      assert.strictEqual(styleReq.updateTextStyle.textStyle.italic, true);
    });
  });

  describe('Links', () => {
    it('should convert basic links', () => {
      const markdown = '[link text](https://example.com)';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReq = requests.find(r => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.text, 'link text');

      const styleReq = requests.find(r => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request with link');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.link.url, 'https://example.com');
    });
  });

  describe('Headings', () => {
    it('should convert H1', () => {
      const markdown = '# Heading 1';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReq = requests.find(r => r.insertText && r.insertText.text === 'Heading 1');
      assert.ok(insertReq, 'Should have insert request for heading text');

      const paraReq = requests.find(r => r.updateParagraphStyle);
      assert.ok(paraReq, 'Should have paragraph style request');
      assert.strictEqual(paraReq.updateParagraphStyle.paragraphStyle.namedStyleType, 'HEADING_1');
    });

    it('should convert H2', () => {
      const markdown = '## Heading 2';
      const requests = convertMarkdownToRequests(markdown, 1);

      const paraReq = requests.find(r => r.updateParagraphStyle);
      assert.ok(paraReq, 'Should have paragraph style request');
      assert.strictEqual(paraReq.updateParagraphStyle.paragraphStyle.namedStyleType, 'HEADING_2');
    });

    it('should convert H3', () => {
      const markdown = '### Heading 3';
      const requests = convertMarkdownToRequests(markdown, 1);

      const paraReq = requests.find(r => r.updateParagraphStyle);
      assert.ok(paraReq, 'Should have paragraph style request');
      assert.strictEqual(paraReq.updateParagraphStyle.paragraphStyle.namedStyleType, 'HEADING_3');
    });
  });

  describe('Lists', () => {
    it('should convert bullet lists', () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const requests = convertMarkdownToRequests(markdown, 1);

      const bulletReqs = requests.filter(r => r.createParagraphBullets);
      assert.strictEqual(bulletReqs.length, 3, 'Should have 3 bullet requests');
      assert.strictEqual(bulletReqs[0].createParagraphBullets.bulletPreset, 'BULLET_DISC_CIRCLE_SQUARE');
    });

    it('should convert numbered lists', () => {
      const markdown = '1. Item 1\n2. Item 2\n3. Item 3';
      const requests = convertMarkdownToRequests(markdown, 1);

      const bulletReqs = requests.filter(r => r.createParagraphBullets);
      assert.strictEqual(bulletReqs.length, 3, 'Should have 3 numbered list requests');
      assert.strictEqual(bulletReqs[0].createParagraphBullets.bulletPreset, 'NUMBERED_DECIMAL_ALPHA_ROMAN');
    });
  });

  describe('Mixed Content', () => {
    it('should convert document with multiple elements', () => {
      const markdown = `# Title

This is **bold** and *italic* text with a [link](https://example.com).

- List item 1
- List item 2

## Heading 2

More content.`;

      const requests = convertMarkdownToRequests(markdown, 1);

      // Should have various request types
      assert.ok(requests.some(r => r.insertText), 'Should have insert requests');
      assert.ok(requests.some(r => r.updateTextStyle), 'Should have text style requests');
      assert.ok(requests.some(r => r.updateParagraphStyle), 'Should have paragraph style requests');
      assert.ok(requests.some(r => r.createParagraphBullets), 'Should have bullet requests');

      // Check heading styles
      const h1Req = requests.find(r =>
        r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_1'
      );
      assert.ok(h1Req, 'Should have H1 heading');

      const h2Req = requests.find(r =>
        r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2'
      );
      assert.ok(h2Req, 'Should have H2 heading');
    });
  });

  describe('Index Tracking', () => {
    it('should use correct start index', () => {
      const markdown = 'Test text';
      const startIndex = 100;
      const requests = convertMarkdownToRequests(markdown, startIndex);

      const insertReq = requests.find(r => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.location.index, startIndex);
    });

    it('should track indices for sequential inserts', () => {
      const markdown = 'First paragraph.\n\nSecond paragraph.';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReqs = requests.filter(r => r.insertText);
      assert.ok(insertReqs.length > 0, 'Should have multiple insert requests');

      // Each insert should have a location with index
      insertReqs.forEach(req => {
        assert.ok(req.insertText.location, 'Should have location');
        assert.ok(typeof req.insertText.location.index === 'number', 'Should have numeric index');
      });
    });
  });

  describe('Tab Support', () => {
    it('should include tabId in requests when provided', () => {
      const markdown = '**bold text**';
      const tabId = 'tab123';
      const requests = convertMarkdownToRequests(markdown, 1, tabId);

      const insertReq = requests.find(r => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.location.tabId, tabId);

      const styleReq = requests.find(r => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.range.tabId, tabId);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty markdown', () => {
      const markdown = '';
      const requests = convertMarkdownToRequests(markdown, 1);
      assert.strictEqual(requests.length, 0, 'Should return empty array for empty markdown');
    });

    it('should handle whitespace-only markdown', () => {
      const markdown = '   \n\n   ';
      const requests = convertMarkdownToRequests(markdown, 1);
      assert.strictEqual(requests.length, 0, 'Should return empty array for whitespace-only markdown');
    });

    it('should handle plain text without formatting', () => {
      const markdown = 'Just plain text';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReq = requests.find(r => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.text, 'Just plain text');

      // Should not have formatting requests for plain text
      const styleReqs = requests.filter(r => r.updateTextStyle);
      assert.strictEqual(styleReqs.length, 0, 'Should not have style requests for plain text');
    });
  });
});
