import { describe, it, expect, vi } from 'vitest';
import { findTextRange } from './googleDocsApiHelpers.js';

describe('Text Range Finding', () => {
  describe('findTextRange', () => {
    it('should find text within a single text run correctly', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 25,
                          textRun: {
                            content: 'This is a test sentence.',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      const result = await findTextRange(mockDocs as any, 'doc123', 'test', 1);
      expect(result).toEqual({ startIndex: 11, endIndex: 15 });

      expect(mockDocs.documents.get).toHaveBeenCalledOnce();
      expect(mockDocs.documents.get).toHaveBeenCalledWith({
        documentId: 'doc123',
        fields:
          'body(content(paragraph(elements(startIndex,endIndex,textRun(content))),table,sectionBreak,tableOfContents,startIndex,endIndex))',
      });
    });

    it('should find the nth instance of text correctly', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 41,
                          textRun: {
                            content: 'Test test test. This is a test sentence.',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      const result = await findTextRange(mockDocs as any, 'doc123', 'test', 3);
      expect(result).toEqual({ startIndex: 27, endIndex: 31 });
    });

    it('should return null if text is not found', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 25,
                          textRun: {
                            content: 'This is a sample sentence.',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      const result = await findTextRange(mockDocs as any, 'doc123', 'test', 1);
      expect(result).toBeNull();
    });

    it('should handle text spanning multiple text runs', async () => {
      const mockDocs = {
        documents: {
          get: vi.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 6,
                          textRun: { content: 'This ' },
                        },
                        {
                          startIndex: 6,
                          endIndex: 11,
                          textRun: { content: 'is a ' },
                        },
                        {
                          startIndex: 11,
                          endIndex: 20,
                          textRun: { content: 'test case' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          })),
        },
      };

      const result = await findTextRange(mockDocs as any, 'doc123', 'a test', 1);
      expect(result).toEqual({ startIndex: 9, endIndex: 15 });
    });
  });
});
