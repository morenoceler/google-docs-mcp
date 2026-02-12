import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { DocumentIdParameter, NotImplementedError } from '../../types.js';

export function register(server: FastMCP) {
  server.addTool({
    name: 'findElement',
    description:
      'Finds elements (paragraphs, tables, etc.) based on various criteria. (Not Implemented)',
    parameters: DocumentIdParameter.extend({
      // Define complex query parameters...
      textQuery: z.string().optional(),
      elementType: z.enum(['paragraph', 'table', 'list', 'image']).optional(),
      // styleQuery...
    }),
    execute: async (args, { log }) => {
      log.warn('findElement tool called but is not implemented.');
      throw new NotImplementedError(
        'Finding elements by complex criteria is not yet implemented.'
      );
    },
  });
}
