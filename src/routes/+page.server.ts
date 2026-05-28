import type { PageServerLoad } from './$types';
import prisma from '$lib/server/prisma';

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const nodes = await prisma.nodes.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    // console.log(nodes);

    return {
      nodes
    };
  } catch (error) {
    console.error("Prisma load error on nodes:", error);
    return {
      nodes: [],
      error: "Failed to load network nodes."
    };
  }
};
