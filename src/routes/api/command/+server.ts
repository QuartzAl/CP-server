// src/routes/api/your-endpoint/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mqttClient } from '$lib/server/mqtt';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { nodeId, value } = body;

    if (!nodeId || value === undefined) {
      return json({ error: 'Missing required fields (nodeId, value)' }, { status: 400 });
    }

    if (typeof value !== 'number' || value < 0 || value > 10000) {
      return json({ error: 'Target current value out of safe physical bounds' }, { status: 403 });
    }

    const topic = `ICCP/${nodeId}/cmd`;
    const payload = value.toString();

    await new Promise<void>((resolve, reject) => {
      mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error('Failed to publish:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    console.log(`success send to topic ${topic}, value: ${value}`);

    return json({ success: true, message: `Command published to ${topic}` });

  } catch (error) {
    console.error("API Error:", error);
    return json({ error: 'Internal Server Error' }, { status: 500 });
  }
};
