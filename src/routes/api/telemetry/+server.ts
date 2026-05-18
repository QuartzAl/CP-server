import { InfluxDB } from '@influxdata/influxdb-client';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Define the shape of our time configuration
interface TimeConfig {
  range: string;
  window: string;
}

// Define the expected shape of a row coming back from InfluxDB Flux queries
interface InfluxRow {
  _time: string;
  _field: string;
  _value: number;
  node_id?: string;
  _measurement?: string;
  [key: string]: any; // Allow other properties just in case
}

export const GET: RequestHandler = async ({ url }) => {
  const timespan = url.searchParams.get('timespan') || '24h';
  const nodeId = url.searchParams.get('node') || 'node-alpha';

  // Map the UI timespans to InfluxDB time ranges and aggregation windows
  const timeConfig: Record<string, TimeConfig> = {
    '1h': { range: '-1h', window: '1m' },
    '24h': { range: '-24h', window: '30m' },
    '7d': { range: '-7d', window: '3h' },
    '30d': { range: '-30d', window: '12h' }
  };

  const config: TimeConfig = timeConfig[timespan] || timeConfig['24h'];

  // Initialize the InfluxDB client securely using environment variables.
  // Notice the "as string" assertions, assuring TS these environment variables exist.
  const queryApi = new InfluxDB({
    url: env.INFLUX_URL as string,
    token: env.INFLUX_TOKEN as string
  }).getQueryApi(env.INFLUX_ORG as string);

  // Flux Query: Filters by node, gets all fields, and downsamples the data
  const fluxQuery = `
        from(bucket:"${env.INFLUX_BUCKET}")
            |> range(start: ${config.range})
            |> filter(fn: (r) => r._measurement == "ICCP")
            |> filter(fn: (r) => r.node_id == "${nodeId}")
            |> filter(fn: (r) => r._field == "bus_voltage_V" or r._field == "current_mA" or r._field == "electrode_V" or r._field == "soil_humidity_V" or r._field == "target_current_mA")
            |> aggregateWindow(every: ${config.window}, fn: mean, createEmpty: false)
            |> yield(name: "mean")
    `;

  try {
    // Data structures explicitly typed for Chart.js
    const labels: string[] = [];
    const datasets: {
      busV: (number | null)[];
      busI: (number | null)[];
      electrodeV: (number | null)[];
      humidity: (number | null)[];
      predictedV: (number | null)[];
    } = {
      busV: [], busI: [], electrodeV: [], humidity: [], predictedV: []
    };

    // We use a Set to track unique timestamps so we don't duplicate labels
    const timeSet = new Set<string>();
    const rows: InfluxRow[] = [];

    // Execute the query
    for await (const { values, tableMeta } of queryApi.iterateRows(fluxQuery)) {
      const o = tableMeta.toObject(values) as InfluxRow;
      rows.push(o);
      timeSet.add(o._time);
    }

    // Sort timestamps chronologically
    const sortedTimes = Array.from(timeSet).sort();

    // Format labels for the frontend
    sortedTimes.forEach(timeString => {
      const d = new Date(timeString);
      const label = timespan.includes('h')
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      labels.push(label);
    });

    // Map the data to the corresponding timestamps
    sortedTimes.forEach(time => {
      const timeRows = rows.filter(r => r._time === time);

      const getVal = (field: string): number | null => {
        const row = timeRows.find(r => r._field === field);
        return row ? row._value : null;
      };

      datasets.busV.push(getVal('bus_voltage'));
      datasets.busI.push(getVal('bus_current'));
      datasets.electrodeV.push(getVal('electrode_voltage'));
      datasets.humidity.push(getVal('humidity'));

      // Dummy AI prediction logic (replace with real DB query if AI stores to Influx)
      const elV = getVal('electrode_voltage');
      datasets.predictedV.push(elV !== null ? elV + 0.02 : null);
    });

    return json({ labels, ...datasets });

  } catch (error) {
    console.error("InfluxDB Query Error:", error);
    return json({ error: 'Failed to fetch telemetry data' }, { status: 500 });
  }
}
