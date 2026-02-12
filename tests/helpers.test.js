// tests/helpers.test.js
import { findTextRange, getTableCellRange } from '../dist/googleDocsApiHelpers.js';
import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

describe('Text Range Finding', () => {
  // Test hypothesis 1: Text range finding works correctly

  describe('findTextRange', () => {
    it('should find text within a single text run correctly', async () => {
      // Mock the docs.documents.get method to return a predefined structure
      const mockDocs = {
        documents: {
          get: mock.fn(async () => ({
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

      // Test finding "test" in the sample text
      const result = await findTextRange(mockDocs, 'doc123', 'test', 1);
      assert.deepStrictEqual(result, { startIndex: 11, endIndex: 15 });

      // Verify the docs.documents.get was called with the right parameters
      assert.strictEqual(mockDocs.documents.get.mock.calls.length, 1);
      assert.deepStrictEqual(mockDocs.documents.get.mock.calls[0].arguments[0], {
        documentId: 'doc123',
        fields: 'body(content(paragraph(elements(startIndex,endIndex,textRun(content))),table,sectionBreak,tableOfContents,startIndex,endIndex))',
      });
    });

    it('should find the nth instance of text correctly', async () => {
      // Mock with a document that has repeated text
      const mockDocs = {
        documents: {
          get: mock.fn(async () => ({
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

      // Find the 3rd instance of "test"
      const result = await findTextRange(mockDocs, 'doc123', 'test', 3);
      assert.deepStrictEqual(result, { startIndex: 27, endIndex: 31 });
    });

    it('should return null if text is not found', async () => {
      const mockDocs = {
        documents: {
          get: mock.fn(async () => ({
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

      // Try to find text that doesn't exist
      const result = await findTextRange(mockDocs, 'doc123', 'test', 1);
      assert.strictEqual(result, null);
    });

    it('should handle text spanning multiple text runs', async () => {
      const mockDocs = {
        documents: {
          get: mock.fn(async () => ({
            data: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [
                        {
                          startIndex: 1,
                          endIndex: 6,
                          textRun: {
                            content: 'This ',
                          },
                        },
                        {
                          startIndex: 6,
                          endIndex: 11,
                          textRun: {
                            content: 'is a ',
                          },
                        },
                        {
                          startIndex: 11,
                          endIndex: 20,
                          textRun: {
                            content: 'test case',
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

      // Find text that spans runs: "a test"
      const result = await findTextRange(mockDocs, 'doc123', 'a test', 1);
      assert.deepStrictEqual(result, { startIndex: 9, endIndex: 15 });
    });
  });
});

describe('Table Cell Range Finding', () => {
  // Helper to build a mock document with a table
  function buildMockDocsWithTable(tableStartIndex, tableRows) {
    return {
      documents: {
        get: mock.fn(async () => ({
          data: {
            body: {
              content: [
                {
                  startIndex: 0,
                  endIndex: tableStartIndex,
                  paragraph: {
                    elements: [
                      { startIndex: 0, endIndex: tableStartIndex, textRun: { content: 'Before table\n' } }
                    ]
                  }
                },
                {
                  startIndex: tableStartIndex,
                  endIndex: 200,
                  table: {
                    rows: tableRows.length,
                    columns: tableRows[0]?.length ?? 0,
                    tableRows: tableRows.map(row => ({
                      tableCells: row.map(cell => ({
                        content: cell.content
                      }))
                    }))
                  }
                }
              ]
            }
          }
        }))
      }
    };
  }

  describe('getTableCellRange', () => {
    it('should return correct range for a cell with text content', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [
          {
            content: [
              {
                startIndex: 16,
                endIndex: 26,
                paragraph: {
                  elements: [
                    { startIndex: 16, endIndex: 26, textRun: { content: 'Cell A1\n' } }
                  ]
                }
              }
            ]
          },
          {
            content: [
              {
                startIndex: 28,
                endIndex: 38,
                paragraph: {
                  elements: [
                    { startIndex: 28, endIndex: 38, textRun: { content: 'Cell B1\n' } }
                  ]
                }
              }
            ]
          }
        ]
      ]);

      const result = await getTableCellRange(mockDocs, 'doc123', 14, 0, 0);
      // endIndex should exclude the trailing \n (26 - 1 = 25)
      assert.deepStrictEqual(result, { startIndex: 16, endIndex: 25 });
    });

    it('should return correct range for second column', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [
          {
            content: [
              { startIndex: 16, endIndex: 26, paragraph: { elements: [{ startIndex: 16, endIndex: 26, textRun: { content: 'Cell A1\n' } }] } }
            ]
          },
          {
            content: [
              { startIndex: 28, endIndex: 38, paragraph: { elements: [{ startIndex: 28, endIndex: 38, textRun: { content: 'Cell B1\n' } }] } }
            ]
          }
        ]
      ]);

      const result = await getTableCellRange(mockDocs, 'doc123', 14, 0, 1);
      assert.deepStrictEqual(result, { startIndex: 28, endIndex: 37 });
    });

    it('should throw UserError if table not found at given startIndex', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [{ content: [{ startIndex: 16, endIndex: 20, paragraph: { elements: [] } }] }]
      ]);

      await assert.rejects(
        () => getTableCellRange(mockDocs, 'doc123', 999, 0, 0),
        (err) => {
          assert.ok(err.message.includes('No table found at startIndex 999'));
          return true;
        }
      );
    });

    it('should throw UserError if row index is out of range', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [{ content: [{ startIndex: 16, endIndex: 20, paragraph: { elements: [] } }] }]
      ]);

      await assert.rejects(
        () => getTableCellRange(mockDocs, 'doc123', 14, 5, 0),
        (err) => {
          assert.ok(err.message.includes('Row index 5 is out of range'));
          return true;
        }
      );
    });

    it('should throw UserError if column index is out of range', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [{ content: [{ startIndex: 16, endIndex: 20, paragraph: { elements: [] } }] }]
      ]);

      await assert.rejects(
        () => getTableCellRange(mockDocs, 'doc123', 14, 0, 5),
        (err) => {
          assert.ok(err.message.includes('Column index 5 is out of range'));
          return true;
        }
      );
    });

    it('should handle cell with multiple paragraphs', async () => {
      const mockDocs = buildMockDocsWithTable(14, [
        [
          {
            content: [
              {
                startIndex: 16,
                endIndex: 26,
                paragraph: { elements: [{ startIndex: 16, endIndex: 26, textRun: { content: 'Line one\n' } }] }
              },
              {
                startIndex: 26,
                endIndex: 36,
                paragraph: { elements: [{ startIndex: 26, endIndex: 36, textRun: { content: 'Line two\n' } }] }
              }
            ]
          }
        ]
      ]);

      const result = await getTableCellRange(mockDocs, 'doc123', 14, 0, 0);
      // Should span from first paragraph start to last paragraph end - 1
      assert.deepStrictEqual(result, { startIndex: 16, endIndex: 35 });
    });
  });
});
