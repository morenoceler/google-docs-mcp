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
      const insertReq = requests.find((r) => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.text, 'bold text');

      // Should have formatting request
      const styleReq = requests.find((r) => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.bold, true);
    });

    it('should convert italic text', () => {
      const markdown = '*italic text*';
      const requests = convertMarkdownToRequests(markdown, 1);

      const styleReq = requests.find((r) => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.italic, true);
    });

    it('should convert strikethrough text', () => {
      const markdown = '~~strikethrough text~~';
      const requests = convertMarkdownToRequests(markdown, 1);

      const styleReq = requests.find((r) => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.strikethrough, true);
    });

    it('should convert nested bold and italic', () => {
      const markdown = '***bold italic***';
      const requests = convertMarkdownToRequests(markdown, 1);

      const styleReq = requests.find((r) => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.bold, true);
      assert.strictEqual(styleReq.updateTextStyle.textStyle.italic, true);
    });

    it('should style inline code as monospace', () => {
      const markdown = 'Use `inline_code` here';
      const requests = convertMarkdownToRequests(markdown, 1);

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      const codeStyleReq = styleReqs.find(
        (r) => r.updateTextStyle.textStyle.weightedFontFamily?.fontFamily === 'Roboto Mono'
      );
      assert.ok(codeStyleReq, 'Should style inline code with monospace font');
    });
  });

  describe('Links', () => {
    it('should convert basic links', () => {
      const markdown = '[link text](https://example.com)';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReq = requests.find((r) => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.text, 'link text');

      const styleReq = requests.find((r) => r.updateTextStyle);
      assert.ok(styleReq, 'Should have style request with link');
      assert.strictEqual(styleReq.updateTextStyle.textStyle.link.url, 'https://example.com');
    });
  });

  describe('Headings', () => {
    it('should convert H1', () => {
      const markdown = '# Heading 1';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReq = requests.find((r) => r.insertText && r.insertText.text === 'Heading 1');
      assert.ok(insertReq, 'Should have insert request for heading text');

      const paraReq = requests.find((r) => r.updateParagraphStyle);
      assert.ok(paraReq, 'Should have paragraph style request');
      assert.strictEqual(paraReq.updateParagraphStyle.paragraphStyle.namedStyleType, 'HEADING_1');
    });

    it('should convert H2', () => {
      const markdown = '## Heading 2';
      const requests = convertMarkdownToRequests(markdown, 1);

      const paraReq = requests.find((r) => r.updateParagraphStyle);
      assert.ok(paraReq, 'Should have paragraph style request');
      assert.strictEqual(paraReq.updateParagraphStyle.paragraphStyle.namedStyleType, 'HEADING_2');
    });

    it('should convert H3', () => {
      const markdown = '### Heading 3';
      const requests = convertMarkdownToRequests(markdown, 1);

      const paraReq = requests.find((r) => r.updateParagraphStyle);
      assert.ok(paraReq, 'Should have paragraph style request');
      assert.strictEqual(paraReq.updateParagraphStyle.paragraphStyle.namedStyleType, 'HEADING_3');
    });
  });

  describe('Lists', () => {
    it('should convert bullet lists', () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const requests = convertMarkdownToRequests(markdown, 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      assert.strictEqual(bulletReqs.length, 3, 'Should have 3 bullet requests');
      assert.strictEqual(
        bulletReqs[0].createParagraphBullets.bulletPreset,
        'BULLET_DISC_CIRCLE_SQUARE'
      );
    });

    it('should convert numbered lists', () => {
      const markdown = '1. Item 1\n2. Item 2\n3. Item 3';
      const requests = convertMarkdownToRequests(markdown, 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      assert.strictEqual(bulletReqs.length, 3, 'Should have 3 numbered list requests');
      assert.strictEqual(
        bulletReqs[0].createParagraphBullets.bulletPreset,
        'NUMBERED_DECIMAL_ALPHA_ROMAN'
      );
    });

    it('should preserve nested list levels with leading tabs', () => {
      const markdown = '- Parent\n  - Child';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReqs = requests.filter((r) => r.insertText);
      assert.ok(
        insertReqs.some((r) => r.insertText.text.includes('Parent')),
        'Should include parent text'
      );
      assert.ok(
        insertReqs.some((r) => r.insertText.text === '\t'),
        'Should insert tab for nested list indentation'
      );
      assert.ok(
        insertReqs.some((r) => r.insertText.text.includes('Child')),
        'Should include child text'
      );
    });

    it('should convert markdown task lists to checkbox bullets', () => {
      const markdown = '- [x] done\n- [ ] todo';
      const requests = convertMarkdownToRequests(markdown, 1);

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      assert.strictEqual(bulletReqs.length, 2, 'Should have two list bullet requests');
      assert.strictEqual(bulletReqs[0].createParagraphBullets.bulletPreset, 'BULLET_CHECKBOX');
      assert.strictEqual(bulletReqs[1].createParagraphBullets.bulletPreset, 'BULLET_CHECKBOX');

      const allInsertedText = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText.text)
        .join('');
      assert.ok(!allInsertedText.includes('[x]'), 'Should strip [x] task prefix from text');
      assert.ok(!allInsertedText.includes('[ ]'), 'Should strip [ ] task prefix from text');
    });

    it('should not let list bullet ranges bleed into following headings', () => {
      const markdown = '- Parent\n  1. Child\n\n## Next Heading';
      const requests = convertMarkdownToRequests(markdown, 1);

      const headingReq = requests.find(
        (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2'
      );
      assert.ok(headingReq, 'Should have H2 paragraph style request');
      const headingStart = headingReq.updateParagraphStyle.range.startIndex;

      const bulletReqs = requests.filter((r) => r.createParagraphBullets);
      const overlappingBullet = bulletReqs.find((r) => {
        const { startIndex, endIndex } = r.createParagraphBullets.range;
        return headingStart >= startIndex && headingStart < endIndex;
      });
      assert.ok(!overlappingBullet, 'No list bullet request should cover heading start index');
    });
  });

  describe('Code Blocks', () => {
    it('should convert fenced code blocks and style them as code', () => {
      const markdown = '```js\nconst x = 1;\nconsole.log(x);\n```';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReqs = requests.filter((r) => r.insertText);
      assert.ok(
        insertReqs.some((r) => r.insertText.text.includes('const x = 1;')),
        'Should insert first code line'
      );
      assert.ok(
        insertReqs.some((r) => r.insertText.text.includes('console.log(x);')),
        'Should insert second code line'
      );

      const styleReqs = requests.filter((r) => r.updateTextStyle);
      const monospaceReqs = styleReqs.filter(
        (r) => r.updateTextStyle.textStyle.weightedFontFamily?.fontFamily === 'Roboto Mono'
      );
      assert.ok(monospaceReqs.length >= 2, 'Should apply monospace style to code block lines');
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
      assert.ok(
        requests.some((r) => r.insertText),
        'Should have insert requests'
      );
      assert.ok(
        requests.some((r) => r.updateTextStyle),
        'Should have text style requests'
      );
      assert.ok(
        requests.some((r) => r.updateParagraphStyle),
        'Should have paragraph style requests'
      );
      assert.ok(
        requests.some((r) => r.createParagraphBullets),
        'Should have bullet requests'
      );

      // Check heading styles
      const h1Req = requests.find(
        (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_1'
      );
      assert.ok(h1Req, 'Should have H1 heading');

      const h2Req = requests.find(
        (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2'
      );
      assert.ok(h2Req, 'Should have H2 heading');
    });
  });

  describe('Index Tracking', () => {
    it('should use correct start index', () => {
      const markdown = 'Test text';
      const startIndex = 100;
      const requests = convertMarkdownToRequests(markdown, startIndex);

      const insertReq = requests.find((r) => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.location.index, startIndex);
    });

    it('should track indices for sequential inserts', () => {
      const markdown = 'First paragraph.\n\nSecond paragraph.';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReqs = requests.filter((r) => r.insertText);
      assert.ok(insertReqs.length > 0, 'Should have multiple insert requests');

      // Each insert should have a location with index
      insertReqs.forEach((req) => {
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

      const insertReq = requests.find((r) => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.location.tabId, tabId);

      const styleReq = requests.find((r) => r.updateTextStyle);
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
      assert.strictEqual(
        requests.length,
        0,
        'Should return empty array for whitespace-only markdown'
      );
    });

    it('should handle plain text without formatting', () => {
      const markdown = 'Just plain text';
      const requests = convertMarkdownToRequests(markdown, 1);

      const insertReq = requests.find((r) => r.insertText);
      assert.ok(insertReq, 'Should have insert request');
      assert.strictEqual(insertReq.insertText.text, 'Just plain text');

      // Should not have formatting requests for plain text
      const styleReqs = requests.filter((r) => r.updateTextStyle);
      assert.strictEqual(styleReqs.length, 0, 'Should not have style requests for plain text');
    });
  });

  describe('Horizontal Rules', () => {
    it('should produce a border-bottom paragraph style for ---', () => {
      const requests = convertMarkdownToRequests('Above\n\n---\n\nBelow', 1);

      const hrReqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      assert.strictEqual(hrReqs.length, 1, 'Should have exactly one HR border request');

      const border = hrReqs[0].updateParagraphStyle.paragraphStyle.borderBottom;
      assert.strictEqual(border.dashStyle, 'SOLID');
      assert.strictEqual(border.width.magnitude, 1);
      assert.strictEqual(border.width.unit, 'PT');
    });

    it('should handle multiple horizontal rules', () => {
      const requests = convertMarkdownToRequests(
        '# Title\n\n---\n\n## S1\n\nText.\n\n---\n\n## S2',
        1
      );

      const hrReqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      assert.strictEqual(hrReqs.length, 2, 'Should have two HR border requests');
    });

    it('should not drop surrounding content', () => {
      const requests = convertMarkdownToRequests('Above\n\n---\n\nBelow', 1);

      const allText = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText.text)
        .join('');

      assert.ok(allText.includes('Above'), 'Should contain text before HR');
      assert.ok(allText.includes('Below'), 'Should contain text after HR');
    });

    it('should place the HR paragraph between surrounding content', () => {
      const requests = convertMarkdownToRequests('Above\n\n---\n\nBelow', 1);

      const hrReqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      assert.strictEqual(hrReqs.length, 1, 'Should have one HR request');

      const hrStart = hrReqs[0].updateParagraphStyle.range.startIndex;
      const hrEnd = hrReqs[0].updateParagraphStyle.range.endIndex;

      const aboveInsert = requests.find(
        (r) => r.insertText && r.insertText.text.includes('Above')
      );
      const belowInsert = requests.find(
        (r) => r.insertText && r.insertText.text.includes('Below')
      );

      assert.ok(aboveInsert.insertText.location.index < hrStart, 'Above text should precede HR');
      assert.ok(belowInsert.insertText.location.index >= hrEnd, 'Below text should follow HR');
    });

    it('should include tabId on HR border requests when provided', () => {
      const requests = convertMarkdownToRequests('---', 1, 'tab-abc');

      const hrReqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      assert.ok(hrReqs.length > 0, 'Should have HR border request');
      assert.strictEqual(
        hrReqs[0].updateParagraphStyle.range.tabId,
        'tab-abc',
        'HR border request should include tabId'
      );
    });

    it('should work in a realistic document with headings, lists, and rules', () => {
      const markdown = `# Project Plan

---

## Goals

- **Speed:** Ship faster
- **Quality:** Fewer bugs

## Timeline

1. Planning
2. Execution
3. Review

---

*Last updated: 2026*`;

      const requests = convertMarkdownToRequests(markdown, 1);

      // HRs
      const hrReqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.borderBottom
      );
      assert.strictEqual(hrReqs.length, 2, 'Should have two HR borders');

      // Headings
      const h1Reqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_1'
      );
      const h2Reqs = requests.filter(
        (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === 'HEADING_2'
      );
      assert.strictEqual(h1Reqs.length, 1, 'Should have one H1');
      assert.strictEqual(h2Reqs.length, 2, 'Should have two H2s');

      // Bullet lists
      const bulletReqs = requests.filter(
        (r) =>
          r.createParagraphBullets?.bulletPreset === 'BULLET_DISC_CIRCLE_SQUARE'
      );
      assert.strictEqual(bulletReqs.length, 2, 'Should have two bullet items');

      // Numbered list
      const numberedReqs = requests.filter(
        (r) =>
          r.createParagraphBullets?.bulletPreset === 'NUMBERED_DECIMAL_ALPHA_ROMAN'
      );
      assert.strictEqual(numberedReqs.length, 3, 'Should have three numbered items');

      // Bold
      const boldReqs = requests.filter(
        (r) => r.updateTextStyle?.textStyle?.bold === true
      );
      assert.ok(boldReqs.length >= 2, 'Should have at least two bold ranges');

      // Italic
      const italicReqs = requests.filter(
        (r) => r.updateTextStyle?.textStyle?.italic === true
      );
      assert.ok(italicReqs.length >= 1, 'Should have at least one italic range');

      // All text present
      const allText = requests
        .filter((r) => r.insertText)
        .map((r) => r.insertText.text)
        .join('');
      assert.ok(allText.includes('Project Plan'), 'Should contain title');
      assert.ok(allText.includes('Ship faster'), 'Should contain list content');
      assert.ok(allText.includes('Execution'), 'Should contain numbered item');
      assert.ok(allText.includes('Last updated: 2026'), 'Should contain footer');
    });
  });
});
