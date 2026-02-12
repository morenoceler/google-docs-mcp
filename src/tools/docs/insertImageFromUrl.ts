import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertImageFromUrl',
    description: 'Inserts an inline image into a Google Document from a publicly accessible URL.',
    parameters: DocumentIdParameter.extend({
      imageUrl: z
        .string()
        .url()
        .describe('Publicly accessible URL to the image (must be http:// or https://).'),
      index: z
        .number()
        .int()
        .min(1)
        .describe('The index (1-based) where the image should be inserted.'),
      width: z.number().min(1).optional().describe('Optional: Width of the image in points.'),
      height: z.number().min(1).optional().describe('Optional: Height of the image in points.'),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      log.info(
        `Inserting image from URL ${args.imageUrl} at index ${args.index} in doc ${args.documentId}`
      );

      try {
        await GDocsHelpers.insertInlineImage(
          docs,
          args.documentId,
          args.imageUrl,
          args.index,
          args.width,
          args.height
        );

        let sizeInfo = '';
        if (args.width && args.height) {
          sizeInfo = ` with size ${args.width}x${args.height}pt`;
        }

        return `Successfully inserted image from URL at index ${args.index}${sizeInfo}.`;
      } catch (error: any) {
        log.error(`Error inserting image in doc ${args.documentId}: ${error.message || error}`);
        if (error instanceof UserError) throw error;
        throw new UserError(`Failed to insert image: ${error.message || 'Unknown error'}`);
      }
    },
  });
}
