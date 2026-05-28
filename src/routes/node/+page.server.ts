import prisma from '$lib/server/prisma';
import { fail, redirect } from '@sveltejs/kit';
import { InfluxDB } from '@influxdata/influxdb-client';
import { env } from '$env/dynamic/private';
import type { PageServerLoad, Actions } from './$types';

// Initialize InfluxDB Client (Ensure these are in your .env file)
const INFLUX_URL = env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = env.INFLUX_TOKEN || '';
const INFLUX_ORG = env.INFLUX_ORG || '';
const INFLUX_BUCKET = env.INFLUX_BUCKET || '';

const queryApi = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN }).getQueryApi(INFLUX_ORG);

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  // 1. Fetch already registered ICCP nodes from PostgreSQL
  let registeredNodes = [];
  try {
    registeredNodes = await prisma.nodes.findMany({
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error("Postgres load error on nodes:", error);
  }

  // 2. Fetch live telemetry stream device IDs from InfluxDB
  let availableDeviceIds: string[] = [];
  try {
    const influxDevices: string[] = [];

    // High-performance Flux query to extract unique device_id tags
    const fluxQuery = `
			import "influxdata/influxdb/schema"
			schema.tagValues(bucket: "${INFLUX_BUCKET}", tag: "device_id")
		`;

    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          if (o._value) influxDevices.push(o._value);
        },
        error(err) { reject(err); },
        complete() { resolve(); }
      });
    });

    // 3. Compare InfluxDB keys with PostgreSQL keys (The Diff)
    const registeredIds = new Set(registeredNodes.map((node) => node.id));
    availableDeviceIds = influxDevices.filter((id) => !registeredIds.has(id));

  } catch (error) {
    console.error("InfluxDB connection failed, reading zero available nodes:", error);
    // We don't crash the whole page if telemetry storage is temporarily down
  }

  return {
    nodes: registeredNodes,
    availableDeviceIds
  };
};

export const actions: Actions = {
  createNode: async ({ request, locals }) => {
    if (locals.user?.role !== 'admin') {
      return fail(403, { error: 'Forbidden: Admin access required.' });
    }

    const data = await request.formData();
    const id = data.get('id')?.toString().trim();
    const name = data.get('name')?.toString().trim();
    const description = data.get('description')?.toString().trim() || null;

    if (!id || !name) {
      return fail(400, { error: 'ICCP Node Selector (ID) and Name are required.' });
    }

    try {
      // Double check uniqueness check at the time of form submission
      const existingNode = await prisma.nodes.findUnique({ where: { id } });
      if (existingNode) {
        return fail(400, { error: `Node ${id} is already registered.` });
      }

      await prisma.nodes.create({
        data: { id, name, description }
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to map ICCP node:", error);
      return fail(500, { error: 'Database rejected the node configuration.' });
    }
  },

  deleteNode: async ({ request, locals }) => {
    if (locals.user?.role !== 'admin') {
      return fail(403, { error: 'Forbidden: Admin access required.' });
    }

    const data = await request.formData();
    const id = data.get('id')?.toString();

    if (!id) return fail(400, { error: 'Identifier is missing.' });

    try {
      await prisma.nodes.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      console.error("Failed to delete node:", error);
      return fail(500, { error: 'Failed to decommission node.' });
    }
  }
};
