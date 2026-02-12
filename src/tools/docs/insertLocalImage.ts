import type { FastMCP } from 'fastmcp';
import { UserError } from 'fastmcp';
import { z } from 'zod';
import { getDocsClient, getDriveClient } from '../../clients.js';
import { DocumentIdParameter } from '../../types.js';
import * as GDocsHelpers from '../../googleDocsApiHelpers.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'insertLocalImage',
    description:
      'Uploads a local image file to Google Drive and inserts it into a Google Document. The image will be uploaded to the same folder as the document (or optionally to a specified folder).',
    parameters: DocumentIdParameter.extend({
      localImagePath: z
        .string()
        .describe(
          'Absolute path to the local image file (supports .jpg, .jpeg, .png, .gif, .bmp, .webp, .svg).'
        ),
      index: z
        .number()
        .int()
        .min(1)
        .describe('The index (1-based) where the image should be inserted in the document.'),
      width: z.number().min(1).optional().describe('Optional: Width of the image in points.'),
      height: z.number().min(1).optional().describe('Optional: Height of the image in points.'),
      uploadToSameFolder: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'If true, uploads the image to the same folder as the document. If false, uploads to Drive root.'
        ),
    }),
    execute: async (args, { log }) => {
      const docs = await getDocsClient();
      const drive = await getDriveClient();
      log.info(
        `Uploading local image ${args.localImagePath} and inserting at index ${args.index} in doc ${args.documentId}`
      );

      try {
        // Get the document's parent folder if requested
        let parentFolderId: string | undefined;
        if (args.uploadToSameFolder) {
          try {
            const docInfo = await drive.files.get({
              fileId: args.documentId,
              fields: 'parents',
              supportsAllDrives: true,
            });
            if (docInfo.data.parents && docInfo.data.parents.length > 0) {
              parentFolderId = docInfo.data.parents[0];
              log.info(`Will upload image to document's parent folder: ${parentFolderId}`);
            }
          } catch (folderError) {
            log.warn(
              `Could not determine document's parent folder, using Drive root: ${folderError}`
            );
          }
        }

        // Upload the image to Drive
        log.info(`Uploading image to Drive...`);
        const imageUrl = await GDocsHelpers.uploadImageToDrive(
          drive,
          args.localImagePath,
          parentFolderId
        );
        log.info(`Image uploaded successfully, public URL: ${imageUrl}`);

        // Insert the image into the document
        await GDocsHelpers.insertInlineImage(
          docs,
          args.documentId,
          imageUrl,
          args.index,
          args.width,
          args.height
        );

        let sizeInfo = '';
        if (args.width && args.height) {
          sizeInfo = ` with size ${args.width}x${args.height}pt`;
        }

        return `Successfully uploaded image to Drive and inserted it at index ${args.index}${sizeInfo}.\nImage URL: ${imageUrl}`;
      } catch (error: any) {
        log.error(
          `Error uploading/inserting local image in doc ${args.documentId}: ${error.message || error}`
        );
        if (error instanceof UserError) throw error;
        throw new UserError(
          `Failed to upload/insert local image: ${error.message || 'Unknown error'}`
        );
      }
    },
  });
}
