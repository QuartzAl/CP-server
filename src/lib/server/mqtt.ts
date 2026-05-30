// src/lib/server/mqtt.ts
import mqtt from 'mqtt';
import { MQTT_URL, MQTT_PASSWORD, MQTT_USER } from '$env/dynamic/private'

// 1. Tell TypeScript about our global variable
const globalWithMqtt = globalThis as unknown as {
  _mqttClient: mqtt.MqttClient | undefined;
};

// 2. Function to initialize the client only if it doesn't exist
function createMqttClient() {
  if (globalWithMqtt._mqttClient) {
    return globalWithMqtt._mqttClient;
  }

  const client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER,
    password: MQTT_PASSWORD,
    clientId: 'sveltekit-backend-publisher'
  });

  client.on('connect', () => {
    console.log(`✅ SvelteKit Backend connected to MQTT Broker: ${process.env.MQTT_URL}`);
  });

  client.on('error', (err) => {
    console.error('❌ MQTT Connection Error:', err);
  });

  // 3. Save it globally for Vite HMR
  if (process.env.NODE_ENV !== 'production') {
    globalWithMqtt._mqttClient = client;
  }

  return client;
}

// Export the singleton instance
export const mqttClient = createMqttClient();
