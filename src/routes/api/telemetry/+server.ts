import { InfluxDB } from '@influxdata/influxdb-client';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Define the shape of our time configuration using precise millisecond offsets
interface TimeConfig {
  window: string;
  model: string | null;
  horizon: string | null;
  startMs: number;
  stopMs: number;
}

// Define the expected shape of a row coming back from InfluxDB Flux queries
interface InfluxRow {
  _time: string;
  _field: string;
  _value: number;
  node_id?: string;
  _measurement?: string;
  model?: string;
  type?: string;
  horizon?: string;
  [key: string]: any; // Allow other properties just in case
}

export const GET: RequestHandler = async ({ url }) => {
  const timespan = url.searchParams.get('timespan') || '24h';
  const nodeId = url.searchParams.get('node') || '001';
  console.log(`MQTT API: timespan ${timespan}, node ${nodeId}`);

  // Map the UI timespans to precise millisecond offsets (History and Future)
  const timeConfig: Record<string, TimeConfig> = {
    '15m': { startMs: 15 * 60 * 1000, stopMs: 7.5 * 60 * 1000, window: '30s', model: 'keras_30s_service', horizon: null },
    '1h': { startMs: 60 * 60 * 1000, stopMs: 30 * 60 * 1000, window: '2m', model: 'keras_2m_service', horizon: null },
    '24h': { startMs: 24 * 60 * 60 * 1000, stopMs: 12 * 60 * 60 * 1000, window: '30m', model: 'keras_10m_service', horizon: null },
    '7d': { startMs: 7 * 24 * 60 * 60 * 1000, stopMs: 3.5 * 24 * 60 * 60 * 1000, window: '3h', model: 'tft_darts_service', horizon: '2950m' },
    '30d': { startMs: 30 * 24 * 60 * 60 * 1000, stopMs: 15 * 24 * 60 * 60 * 1000, window: '12h', model: null, horizon: null }
  };

  const config: TimeConfig = timeConfig[timespan] || timeConfig['24h'];

  // Calculate the absolute time range bounds as ISO strings for Flux
  const now = Date.now();
  const startIso = new Date(now - config.startMs).toISOString();
  const stopIso = new Date(now + config.stopMs).toISOString();

  // Initialize the InfluxDB client securely using environment variables.
  const queryApi = new InfluxDB({
    url: env.INFLUX_URL as string,
    token: env.INFLUX_TOKEN as string
  }).getQueryApi(env.INFLUX_ORG as string);

  const modelFilter = config.model
    ? config.horizon ? `or (r._field == "electrode_V" and r.model == "${config.model}" and r.type == "forecast" and r.horizon == "${config.horizon}")`
      : `or (r._field == "electrode_V" and r.model == "${config.model}" and r.type == "forecast")`
    : "";

  // Flux Query: Ranges from absolute start to absolute stop time
  // NO quotes are placed around the ISO strings, so flux handles them as raw Time literals
  const fluxQuery = `
      from(bucket:"${env.INFLUX_BUCKET}")
          |> range(start: ${startIso}, stop: ${stopIso})
          |> filter(fn: (r) => r.device_id == "${nodeId}")
          |> filter(fn: (r) => 
              r._field == "bus_voltage_V" or 
              r._field == "current_mA" or 
              r._field == "soil_humidity_V" or 
              r._field == "target_current_mA" or 
              (r._field == "electrode_V" and not exists r.model)
              ${modelFilter}
          )
          |> aggregateWindow(every: ${config.window}, fn: mean, createEmpty: false)
          |> yield(name: "mean")
  `;

  try {
    const labels: string[] = [];
    const datasets: {
      busV: (number | null)[];
      busI: (number | null)[];
      TbusI: (number | null)[];
      electrodeV: (number | null)[];
      humidity: (number | null)[];
      predictedV: (number | null)[];
    } = {
      busV: [], busI: [], TbusI: [], electrodeV: [], humidity: [], predictedV: []
    };

    const timeSet = new Set<string>();
    const rows: InfluxRow[] = [];

    // Execute the query
    for await (const { values, tableMeta } of queryApi.iterateRows(fluxQuery)) {
      const o = tableMeta.toObject(values) as InfluxRow;
      rows.push(o);
      timeSet.add(o._time);
    }

    const sortedTimes = Array.from(timeSet).sort();

    // Find where the present moment occurs in our timeline to help the frontend clip the historical charts
    const nowIndex = sortedTimes.findIndex(t => new Date(t).getTime() > now);
    const splitIndex = nowIndex === -1 ? sortedTimes.length : nowIndex;

    sortedTimes.forEach(timeString => {
      const d = new Date(timeString);
      let label = "";

      if (timespan.includes('d') || timespan.includes('w')) {
        label = d.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      else if (config.window.includes('s')) {
        label = d.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
      else {
        label = d.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      labels.push(label);
    });

    // Map the data to the corresponding timestamps
    sortedTimes.forEach(time => {
      const timeRows = rows.filter(r => r._time === time);

      // Raw telemetry
      const getVal = (field: string): number | null => {
        const row = timeRows.find(r => r._field === field && !r.model);
        return row ? row._value : null;
      };

      // Future/Prediction
      const getPrediction = (modelName: string): number | null => {
        const row = timeRows.find(r => r._field === 'electrode_V' && r.model === modelName);
        return row ? row._value : null;
      };

      datasets.busV.push(getVal('bus_voltage_V'));
      datasets.busI.push(getVal('current_mA'));
      datasets.TbusI.push(getVal('target_current_mA'));
      datasets.electrodeV.push(getVal('electrode_V') ? getVal('electrode_V') * -1 : null);
      datasets.humidity.push(getVal('soil_humidity_V'));

      if (config.model) {
        datasets.predictedV.push(getPrediction(config.model) ? getPrediction(config.model) * -1 : null);
      } else {
        datasets.predictedV.push(null);
      }
    });

    // Return the splitIndex down to Svelte
    return json({ labels, splitIndex, ...datasets });

  } catch (error) {
    console.error("InfluxDB Query Error:", error);
    return json({ error: 'Failed to fetch telemetry data' }, { status: 500 });
  }
}
