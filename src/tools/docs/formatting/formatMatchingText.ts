import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../../clients.js';
import { TextStyleArgs } from '../../../types.js';
import * as GDocsHelpers from '../../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  // --- Preserve the existing formatMatchingText tool for backward compatibility ---
  server.addTool({
    name: 'formatMatchingText',
    description:
      'Finds specific text within a Google Document and applies character formatting (bold, italics, color, etc.) to the specified instance.',
    parameters: z
      .object({
        documentId: z.string().describe('The ID of the Google Document.'),
        textToFind: z.string().min(1).describe('The exact text string to find and format.'),
        matchInstance: z
          .number()
          .int()
          .min(1)
          .optional()
          .default(1)
          .describe('Which instance of the text to format (1st, 2nd, etc.). Defaults to 1.'),
        // Re-use optional Formatting Parameters (SHARED)
        bold: z.boolean().optional().describe('Apply bold formatting.'),
        italic: z.boolean().optional().describe('Apply italic formatting.'),
        underline: z.boolean().optional().describe('Apply underline formatting.'),
        strikethrough: z.boolean().optional().describe('Apply strikethrough formatting.'),
        fontSize: z.number().min(1).optional().describe('Set font size (in points, e.g., 12).'),
        fontFamily: z
          .string()
          .optional()
          .describe('Set font family (e.g., "Arial", "Times New Roman").'),
        foregroundColor: z
          .string()
          .refine((color) => /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color), {
            message: 'Invalid hex color format (e.g., #FF0000 or #F00)',
          })
          .optional()
          .describe('Set text color using hex format (e.g., "#FF0000").'),
        backgroundColor: z
          .string()
          .refine((color) => /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color), {
            message: 'Invalid hex color format (e.g., #00FF00 or #0F0)',
          })
          .optional()
          .describe('Set text background color using hex format (e.g., "#FFFF00").'),
        linkUrl: z
          .string()
          .url()
          .optional()
          .describe('Make the text a hyperlink pointing to this URL.'),
      })
      .refine(
        (data) =>
          Object.keys(data).some(
            (key) =>
              !['documentId', 'textToFind', 'matchInstance'].includes(key) &&
              data[key as keyof typeof data] !== undefined
          ),
        {
          message:
            'At least one formatting option (bold, italic, fontSize, etc.) must be provided.',
        }
      ),
    execute: async (args, { log }) => {
      // Adapt to use the new applyTextStyle implementation under the hood
      const docs = await getDocsClient();
      log.info(
        `Using formatMatchingText (legacy) for doc ${args.documentId}, target: "${args.textToFind}" (instance ${args.matchInstance})`
      );

      try {
        // Extract the style parameters
        const styleParams: TextStyleArgs = {};
        if (args.bold !== undefined) styleParams.bold = args.bold;
        if (args.italic !== undefined) styleParams.italic = args.italic;
        if (args.underline !== undefined) styleParams.underline = args.underline;
        if (args.strikethrough !== undefined) styleParams.strikethrough = args.strikethrough;
        if (args.fontSize !== undefined) styleParams.fontSize = args.fontSize;
        if (args.fontFamily !== undefined) styleParams.fontFamily = args.fontFamily;
        if (args.foregroundColor !== undefined) styleParams.foregroundColor = args.foregroundColor;
        if (args.backgroundColor !== undefined) styleParams.backgroundColor = args.backgroundColor;
        if (args.linkUrl !== undefined) styleParams.linkUrl = args.linkUrl;

        // Find the text range
        const range = await GDocsHelpers.findTextRange(
          docs,
          args.documentId,
          args.textToFind,
          args.matchInstance
        );
        if (!range) {
          throw new UserError(
            `Could not find instance ${args.matchInstance} of text "${args.textToFind}".`
          );
        }

        // Build and execute the request
        const requestInfo = GDocsHelpers.buildUpdateTextStyleRequest(
          range.startIndex,
          range.endIndex,
          styleParams
        );
        if (!requestInfo) {
          return 'No valid text styling options were provided.';
        }

        await GDocsHelpers.executeBatchUpdate(docs, args.documentId, [requestInfo.request]);
        return `Successfully applied formatting to instance ${args.matchInstance} of "${args.textToFind}".`;
      } catch (error: any) {
        log.error(
          `Error in formatMatchingText for doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to format text: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
