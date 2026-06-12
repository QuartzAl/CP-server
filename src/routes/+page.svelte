<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { onMount, onDestroy, tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Activity, ChevronDown, Plus, BrainCircuit, LoaderCircle, Send } from 'lucide-svelte';
	import type { SensorData } from '$lib/types/index';
	import { authClient } from '$lib/auth-client';

	async function signOut() {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					goto('/login'); // redirect to login page
				}
			}
		});
	}

	async function adminPanel() {
		await goto('/admin');
	}
	async function handleAddNode() {
		await goto('/node');
	}

	// --- State Management ---
	let serverData = $props<{ data: PageData }>();
	let selectedNodeId = $state('');
	let selectedNode = $derived(
		serverData?.data?.nodes?.find((n) => n.id === selectedNodeId) ?? serverData?.data?.nodes?.[0]
	);
	let selectedNodeName = $derived(selectedNode?.name ?? 'N/A');
	let timespan = $state('1h');
	let intervalID: any;

	let canvas1, canvas2, canvas3, canvas4;
	let charts: any[] = [];
	let isChartJsLoaded = $state(false);

	let isFetchingData = $state(false);
	let isInitialLoad = $state(true);

	// Track which chart is currently fullscreen (0, 1, 2, or 3). null means none.
	let fullscreenChartIndex = $state<number | null>(null);

	let data = $state<SensorData | null>(null);

	// Reactive variables to grab the last available NON-NULL value for the status cards
	let latestBusV = $derived(data?.busV?.filter((v) => v !== null).at(-1));
	let latestBusI = $derived(data?.busI?.filter((v) => v !== null).at(-1));
	let latestElectrodeV = $derived(data?.electrodeV?.filter((v) => v !== null).at(-1));
	let latestPredictedV = $derived(data?.predictedV?.filter((v) => v !== null).at(-1));

	let targetCurrentInput = $state<number | ''>('');
	let isSendingCommand = $state(false);
	let commandStatus = $state<{ text: string; type: 'success' | 'error' | '' }>({
		text: '',
		type: ''
	});

	async function handleSetTargetCurrent() {
		if (targetCurrentInput === '' || targetCurrentInput < 0) {
			commandStatus = { text: 'Please enter a valid positive number.', type: 'error' };
			return;
		}

		isSendingCommand = true;
		commandStatus = { text: '', type: '' };

		try {
			const res = await fetch('/api/command', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					nodeId: selectedNodeId,
					value: Number(targetCurrentInput)
				})
			});

			const resultData = await res.json();
			if (resultData.success) {
				commandStatus = { text: `Target set to ${targetCurrentInput} mA.`, type: 'success' };
				targetCurrentInput = ''; // Clear input on success

				// Auto-clear the success message after 5 seconds
				setTimeout(() => {
					commandStatus = { text: '', type: '' };
				}, 5000);
			} else {
				commandStatus = { text: `Error: ${resultData.error}`, type: 'error' };
			}
		} catch (err) {
			console.error('Command sending failed:', err);
			commandStatus = { text: 'Failed to communicate with server.', type: 'error' };
		} finally {
			isSendingCommand = false;
		}
	}

	// Function to toggle any chart into fullscreen and update its axis logic
	async function toggleFullscreen(index: number) {
		const isOpening = fullscreenChartIndex !== index;
		fullscreenChartIndex = isOpening ? index : null;

		// Wait for Svelte to apply the fixed Tailwind classes to the DOM
		await tick();

		const chart = charts[index];
		if (chart) {
			// Toggle X and Y axes visibility
			Object.keys(chart.options.scales).forEach((scaleKey) => {
				if (scaleKey === 'x') {
					// Toggle X axis labels
					chart.options.scales[scaleKey].display = isOpening;
				} else if (scaleKey.startsWith('y')) {
					// Toggle Y axis start at 0
					chart.options.scales[scaleKey].beginAtZero = isOpening;

					// Force all Y axes to be visible in fullscreen mode
					if (isOpening) {
						chart.options.scales[scaleKey].display = true;
					} else {
						// Revert to default hidden state for specific secondary axes on Chart 1
						if (scaleKey === 'yH' || scaleKey === 'yR') {
							chart.options.scales[scaleKey].display = false;
						} else {
							chart.options.scales[scaleKey].display = true;
						}
					}
				}
			});

			// Force chart to apply the new axis setting without animation judder
			chart.update('none');
		}

		// Force an immediate resize to attempt to fill space quickly
		charts.forEach((c) => c.resize());

		// FIX: The CSS transition takes 300ms. We must force Chart.js to recalculate
		// its dimensions AFTER the transition finishes to prevent the "elongated" canvas bug.
		setTimeout(() => {
			charts.forEach((c) => c.resize());
		}, 310);
	}

	// Reactively re-render chart whenever shadcn Tabs or Dropdown values change
	$effect(() => {
		if (serverData?.data?.nodes?.length && !selectedNodeId) {
			selectedNodeId = serverData.data.nodes[0].id;
		}
		// Create an internal async function so the effect itself stays sync
		async function runUpdatePipeline() {
			if (isChartJsLoaded && (timespan || selectedNodeId)) {
				// 1. Line up the fetch and WAIT for it to finish successfully
				await fetchRealData(timespan, selectedNodeId);

				// 2. Only render the chart AFTER we know data is safely populated
				renderChart();
			}
		}

		runUpdatePipeline();
	});

	// --- Real Data Fetcher ---
	async function fetchRealData(span, node) {
		try {
			isFetchingData = true;
			const response = await fetch(`/api/telemetry?timespan=${span}&node=${node}`);
			if (!response.ok) throw new Error('Failed to fetch data');

			// Mutate your global reactive state here
			data = await response.json();
			console.log(`update data: time range ${span} and node ${node}`);
		} catch (error) {
			console.error('Error fetching from API:', error);

			data = {
				labels: [],
				busV: [],
				busI: [],
				TbusI: [],
				electrodeV: [],
				predictedV: [],
				humidity: []
			};
		} finally {
			isFetchingData = false;
			isInitialLoad = false;
			renderChart();
		}
	}

	async function renderChart() {
		if (!isChartJsLoaded || !canvas1 || !canvas2 || !canvas3 || !canvas4) return;

		// 1. Take the complete snapshot immediately
		const dataSnapshot = $state.snapshot(data);

		// If data isn't loaded yet or arrays are empty, exit safely
		if (!dataSnapshot || !dataSnapshot.labels || dataSnapshot.labels.length === 0) return;

		// Find the index that separates historical data from future (predicted) data
		// (Fallback safely to length if API didn't return a splitIndex)
		const splitIdx = (dataSnapshot as any).splitIndex ?? dataSnapshot.labels.length;

		// 2. Calculate derived metrics using only the snapshot
		const processed = {
			...dataSnapshot,
			resistance: [],
			deviation: [],
			TbusI: dataSnapshot.TbusI || []
		};

		for (let i = 0; i < dataSnapshot.labels.length; i++) {
			// Fallback target current calculation if API doesn't provide one
			// if (processed.TbusI[i] === undefined || processed.TbusI[i] === null) {
			// 	processed.TbusI[i] = dataSnapshot.busI[i] ? dataSnapshot.busI[i] * 0.95 : 12;
			// }

			const v = dataSnapshot.busV[i] ?? 0;
			const current = dataSnapshot.busI[i] ?? 0;

			// R = V / I (Assumes busI is in mA, adjusts to A for Ohms Law)
			processed.resistance[i] =
				v !== null && current !== 0 ? +(v / (current / 1000)).toFixed(2) : null;

			// Deviation = Current - Target
			const t = processed.TbusI[i];
			processed.deviation[i] = current !== null && t !== null ? +(current - t).toFixed(2) : null;
		}

		// 3. OPTIMIZATION: If charts already exist, update their data matrices smoothly instead of destroying them
		if (charts.length === 4) {
			// Chart 1 Update (Historical Only - slice arrays at current timestamp)
			charts[0].data.labels = dataSnapshot.labels.slice(0, splitIdx);
			charts[0].data.datasets[0].data = dataSnapshot.busV.slice(0, splitIdx);
			charts[0].data.datasets[1].data = dataSnapshot.busI.slice(0, splitIdx);
			charts[0].data.datasets[2].data = dataSnapshot.humidity.slice(0, splitIdx);
			charts[0].data.datasets[3].data = processed.resistance.slice(0, splitIdx);

			// Chart 2 Update (Historical Only - slice arrays at current timestamp)
			charts[1].data.labels = dataSnapshot.labels.slice(0, splitIdx);
			charts[1].data.datasets[0].data = dataSnapshot.busI.slice(0, splitIdx);
			charts[1].data.datasets[1].data = processed.TbusI.slice(0, splitIdx);
			charts[1].data.datasets[2].data = processed.deviation.slice(0, splitIdx);

			// Compute mins/maxs strictly over the historical slice avoiding nulls and NaN
			const histTbusI = processed.TbusI.slice(0, splitIdx);
			const histBusI = dataSnapshot.busI.slice(0, splitIdx);
			const histDev = processed.deviation.slice(0, splitIdx);

			const targetMean = histTbusI.reduce((a, b) => a + (b || 0), 0) / (histTbusI.length || 1);
			const validHistBusI = histBusI.filter((v) => v !== null) as number[];
			const validHistDev = histDev.filter((v) => v !== null) as number[];

			const targetMin = validHistBusI.length ? Math.min(...validHistBusI) : 0;
			const targetMax = validHistBusI.length ? Math.max(...validHistBusI) : 0;
			const devMin = validHistDev.length ? Math.min(...validHistDev) : 0;
			const devMax = validHistDev.length ? Math.max(...validHistDev) : 0;

			const ratio =
				targetMax - targetMin !== 0 ? (targetMean - targetMin) / (targetMax - targetMin) : 0.5;
			if (ratio <= 0 || ratio >= 1) {
				console.warn('Target is outside primary axis bounds.');
			}
			const cMax = devMax > 0 && ratio !== 1 ? devMax / (1 - ratio) : 0;
			const cMin = devMin < 0 && ratio !== 0 ? Math.abs(devMin) / ratio : 0;
			const C = Math.max(cMax, cMin);
			charts[1].min = -(C * ratio);
			charts[1].max = C * (1 - ratio);

			// Chart 3 Update (Historical + Future Predictions)
			charts[2].data.labels = dataSnapshot.labels;
			charts[2].data.datasets[0].data = dataSnapshot.electrodeV;
			charts[2].data.datasets[1].data = dataSnapshot.predictedV;

			// Chart 4 Update (Historical + Future Predictions)
			charts[3].data.labels = dataSnapshot.labels;
			charts[3].data.datasets[0].data = dataSnapshot.busI;
			charts[3].data.datasets[1].data = processed.TbusI;
			charts[3].data.datasets[2].data = dataSnapshot.electrodeV;
			charts[3].data.datasets[3].data = dataSnapshot.predictedV;

			// Tell Chart.js to animate the new data points in seamlessly
			charts.forEach((c) => c.update());
			return;
		}

		// 4. FIRST RUN ONLY: If arrays are empty, build the charts for the first time
		const commonOptions = {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'index', intersect: false },
			animation: { duration: 500 },
			plugins: {
				legend: {
					position: 'top',
					labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } }
				},
				tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 10, cornerRadius: 8 }
			},
			scales: { x: { display: false } }
		};

		// --- Chart 1 (Index 0): Bus V, Bus I, Soil Humidity, Resistance (Historical) ---
		// @ts-ignore
		charts.push(
			new Chart(canvas1.getContext('2d'), {
				type: 'line',
				data: {
					labels: dataSnapshot.labels.slice(0, splitIdx),
					datasets: [
						{
							label: 'Voltage (V)',
							data: dataSnapshot.busV.slice(0, splitIdx),
							borderColor: '#eab308',
							yAxisID: 'yV',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0
						},
						{
							label: 'Current (mA)',
							data: dataSnapshot.busI.slice(0, splitIdx),
							borderColor: '#ef4444',
							yAxisID: 'yI',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0
						},
						{
							label: 'Humidity (%)',
							data: dataSnapshot.humidity.slice(0, splitIdx),
							borderColor: '#22c55e',
							yAxisID: 'yH',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0,
							borderDash: [5, 5]
						},
						{
							label: 'Resistance (Ω)',
							data: processed.resistance.slice(0, splitIdx),
							borderColor: '#64748b',
							yAxisID: 'yR',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0
						}
					]
				},
				options: {
					...commonOptions,
					scales: {
						x: { display: false },
						yV: { type: 'linear', position: 'left', title: { display: true, text: 'Voltage (V)' } },
						yI: {
							type: 'linear',
							position: 'right',
							grid: { drawOnChartArea: false },
							title: { display: true, text: 'Current (mA)' }
						},
						yH: {
							type: 'linear',
							position: 'right',
							display: false,
							grid: { drawOnChartArea: false },
							title: { display: true, text: 'Humidity (%)' }
						},
						yR: {
							type: 'linear',
							position: 'left',
							display: false,
							grid: { drawOnChartArea: false },
							title: { display: true, text: 'Resistance (Ω)' }
						}
					}
				}
			})
		);

		// --- Chart 2 (Index 1): Bus Current, Target Current, Deviation (Historical) ---
		// @ts-ignore
		charts.push(
			new Chart(canvas2.getContext('2d'), {
				type: 'line',
				data: {
					labels: dataSnapshot.labels.slice(0, splitIdx),
					datasets: [
						{
							label: 'Current (mA)',
							data: dataSnapshot.busI.slice(0, splitIdx),
							borderColor: '#ef4444',
							yAxisID: 'yI',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0
						},
						{
							label: 'Target (mA)',
							data: processed.TbusI.slice(0, splitIdx),
							borderColor: '#3b82f6',
							yAxisID: 'yI',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0,
							borderDash: [5, 5]
						},
						{
							type: 'bar',
							label: 'Deviation (mA)',
							data: processed.deviation.slice(0, splitIdx),
							backgroundColor: 'rgba(239, 68, 68, 0.2)',
							yAxisID: 'yD'
						}
					]
				},
				options: {
					...commonOptions,
					scales: {
						x: { display: false },
						yI: { type: 'linear', position: 'left', title: { display: true, text: 'mA' } },
						yD: {
							type: 'linear',
							position: 'right',
							grid: { drawOnChartArea: false },
							title: { display: true, text: 'Deviation' },
							suggestedMin: -2,
							suggestedMax: 2
						}
					}
				}
			})
		);

		// --- Chart 3 (Index 2): Electrode V & AI Predicted V (Full Timeline) ---
		// @ts-ignore
		charts.push(
			new Chart(canvas3.getContext('2d'), {
				type: 'line',
				data: {
					labels: dataSnapshot.labels,
					datasets: [
						{
							label: 'Electrode (V)',
							data: dataSnapshot.electrodeV,
							borderColor: '#3b82f6',
							yAxisID: 'yE',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0
						},
						{
							label: 'AI Predicted (V)',
							data: dataSnapshot.predictedV,
							borderColor: '#a855f7',
							yAxisID: 'yE',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0,
							borderDash: [5, 5]
						}
					]
				},
				options: {
					...commonOptions,
					scales: {
						x: { display: false },
						yE: {
							type: 'linear',
							position: 'left',
							title: { display: true, text: 'Electrode (V)' }
						}
					}
				}
			})
		);

		// --- Chart 4 (Index 3): Current, Target, Electrode, Predicted (Full Timeline) ---
		// @ts-ignore
		charts.push(
			new Chart(canvas4.getContext('2d'), {
				type: 'line',
				data: {
					labels: dataSnapshot.labels,
					datasets: [
						{
							label: 'Current (mA)',
							data: dataSnapshot.busI,
							borderColor: '#ef4444',
							yAxisID: 'yI',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0
						},
						{
							label: 'Target (mA)',
							data: processed.TbusI,
							borderColor: '#f97316',
							yAxisID: 'yI',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0,
							borderDash: [5, 5]
						},
						{
							label: 'Electrode (V)',
							data: dataSnapshot.electrodeV,
							borderColor: '#3b82f6',
							yAxisID: 'yE',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0
						},
						{
							label: 'Predicted (V)',
							data: dataSnapshot.predictedV,
							borderColor: '#a855f7',
							yAxisID: 'yE',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0,
							borderDash: [5, 5]
						}
					]
				},
				options: {
					...commonOptions,
					scales: {
						x: { display: false },
						yI: {
							type: 'linear',
							position: 'left',
							title: { display: true, text: 'Current (mA)' }
						},
						yE: {
							type: 'linear',
							position: 'right',
							grid: { drawOnChartArea: false },
							title: { display: true, text: 'Electrode' }
						}
					}
				}
			})
		);
	}

	onMount(() => {
		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
		script.onload = () => {
			isChartJsLoaded = true;
		};
		document.head.appendChild(script);

		intervalID = setInterval(function () {
			fetchRealData(timespan, selectedNodeId);
		}, 5000);

		return () => {
			charts.forEach((c) => c.destroy());
			if (document.head.contains(script)) document.head.removeChild(script);
		};
	});

	onDestroy(() => {
		clearInterval(intervalID);
	});
</script>

<div class="min-h-screen bg-background font-sans text-foreground">
	<!-- Header & Navigation -->
	<header class="sticky top-0 z-30 border-b bg-background shadow-sm">
		<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
			<!-- Logo & Title -->
			<div class="flex items-center gap-3">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
				>
					<Activity class="h-5 w-5" />
				</div>
				<h1 class="text-xl font-semibold tracking-tight">
					ICCP Sentinel <span class="text-primary">AI</span>
				</h1>
			</div>

			<!-- Node Selection Dropdown (shadcn) -->
			<div>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="outline" class="gap-2 rounded-full">
								<span class="max-w-[150px] truncate sm:max-w-xs">{selectedNodeName}</span>
								<ChevronDown class="h-4 w-4 text-muted-foreground" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-64">
						<DropdownMenu.Label
							class="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
							>Active Nodes</DropdownMenu.Label
						>
						<DropdownMenu.Separator />
						<DropdownMenu.RadioGroup bind:value={selectedNodeId}>
							{#each serverData?.data?.nodes || [] as node}
								<DropdownMenu.RadioItem value={node.id} class="cursor-pointer">
									<div class="flex w-full flex-col">
										<span>{node.name}</span>
										<span class="text-xs text-muted-foreground">{node.description}</span>
									</div>
								</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>
						<DropdownMenu.Separator />
						{#if page.data?.user?.role === 'admin'}
							<DropdownMenu.Item
								class="cursor-pointer font-medium text-primary"
								onclick={handleAddNode}
							>
								<Plus class="mr-2 h-4 w-4" />
								Add New Node...
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				{#if page.data?.user?.role === 'admin'}
					<Button variant="ghost" onclick={adminPanel}>Admin Panel</Button>
				{/if}
				<Button variant="ghost" onclick={signOut}>Sign Out</Button>
			</div>
		</div>
	</header>

	<!-- Main Content Area -->
	<main class="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
		<!-- Header & Timespan Controls -->
		<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
			<div>
				<h2 class="text-2xl font-bold">{selectedNodeName}</h2>
				<p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
					<span class="relative flex h-2 w-2">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
						></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
					</span>
					Live Data Monitoring
				</p>
				{#if selectedNode?.description !== undefined}
					<p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
						{selectedNode.description}
					</p>
				{/if}
			</div>

			<!-- Timespan Selector (shadcn Tabs) -->
			<Tabs.Root bind:value={timespan} class="w-full sm:w-[300px]">
				<Tabs.List class="grid w-full grid-cols-5">
					<Tabs.Trigger value="15m">15m</Tabs.Trigger>
					<Tabs.Trigger value="1h">1H</Tabs.Trigger>
					<Tabs.Trigger value="24h">24H</Tabs.Trigger>
					<Tabs.Trigger value="7d">7D</Tabs.Trigger>
					<Tabs.Trigger value="30d">30D</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		</div>

		<Card.Root class="border-dashed bg-muted/30 shadow-sm">
			<Card.Content class="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
				<div>
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<Send class="h-4 w-4 text-primary" />
						Target Current Override
					</h3>
					<p class="mt-1 text-xs text-muted-foreground">
						Manually set the target current (mA) for {selectedNodeName}
					</p>
				</div>
				<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
					{#if commandStatus.text}
						<span
							class="text-xs font-medium {commandStatus.type === 'error'
								? 'text-destructive'
								: 'text-green-600 dark:text-green-400'}"
						>
							{commandStatus.text}
						</span>
					{/if}
					<div class="flex items-center gap-2">
						<input
							type="number"
							bind:value={targetCurrentInput}
							placeholder="e.g. 1200"
							class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-[150px]"
							min="0"
							max="10000"
						/>
						<Button
							size="sm"
							onclick={handleSetTargetCurrent}
							disabled={isSendingCommand || targetCurrentInput === ''}
						>
							{#if isSendingCommand}
								<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
								Sending
							{:else}
								Set Target
							{/if}
						</Button>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- System Status Cards -->
		<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<div class="h-2 w-2 rounded-full bg-yellow-500"></div>
						Bus Voltage
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						{latestBusV !== undefined ? latestBusV.toFixed(2) : 'N/A'}
						<span class="text-sm font-normal text-muted-foreground">V</span>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<div class="h-2 w-2 rounded-full bg-red-500"></div>
						Injection Current
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						{latestBusI !== undefined ? latestBusI.toFixed(1) : 'N/A'}
						<span class="text-sm font-normal text-muted-foreground">mA</span>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<div class="h-2 w-2 rounded-full bg-blue-500"></div>
						Electrode Voltage
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						{latestElectrodeV !== undefined ? (latestElectrodeV * -1000.0).toFixed(0) : 'N/A'}
						<span class="text-sm font-normal text-muted-foreground">mV</span>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root
				class="relative overflow-hidden border-0 bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-sm"
			>
				<div
					class="absolute top-0 right-0 -mt-6 -mr-6 h-24 w-24 rounded-full bg-white opacity-10 blur-2xl"
				></div>
				<Card.Header class="pb-2 text-purple-100">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-purple-100">
						<BrainCircuit class="h-4 w-4" />
						AI Prediction
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						{latestPredictedV !== undefined ? latestPredictedV.toFixed(2) : 'N/A'}
						<span class="text-sm font-normal text-purple-200">V (Forecast)</span>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="relative">
			{#if !isChartJsLoaded || isInitialLoad}
				<div
					class="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm transition-all"
				>
					<div class="flex flex-col items-center text-muted-foreground">
						<LoaderCircle class="mb-4 h-8 w-8 animate-spin text-primary" />
						<span class="text-sm font-medium">
							{!isChartJsLoaded ? 'Initializing Charting Engine...' : 'Fetching Live Data...'}
						</span>
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<!-- Chart 1 -->
				<Card.Root
					class="flex cursor-pointer flex-col transition-all duration-300 ease-in-out hover:border-primary/50 hover:shadow-md {fullscreenChartIndex ===
					0
						? 'fixed inset-0 z-[50] m-0 h-screen w-screen rounded-none bg-background p-4 shadow-2xl sm:p-6'
						: ''}"
					onclick={(e) => {
						// Don't close if they are clicking the canvas directly to view tooltips
						if (fullscreenChartIndex === 0 && e.target.tagName === 'CANVAS') return;
						toggleFullscreen(0);
					}}
				>
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium">Power & Environmental Constraints</Card.Title>
						{#if fullscreenChartIndex === 0}
							<Button
								variant="outline"
								size="sm"
								onclick={(e) => {
									e.stopPropagation();
									toggleFullscreen(0);
								}}
							>
								Close Fullscreen
							</Button>
						{/if}
					</Card.Header>
					<!-- overflow-hidden prevents the elongation bug during CSS layout shifts -->
					<Card.Content
						class="relative w-full overflow-hidden {fullscreenChartIndex === 0
							? 'min-h-[500px] flex-1'
							: 'h-[300px]'}"
					>
						<canvas bind:this={canvas1}></canvas>
					</Card.Content>
				</Card.Root>

				<!-- Chart 2 -->
				<Card.Root
					class="flex cursor-pointer flex-col transition-all duration-300 ease-in-out hover:border-primary/50 hover:shadow-md {fullscreenChartIndex ===
					1
						? 'fixed inset-0 z-[50] m-0 h-screen w-screen rounded-none bg-background p-4 shadow-2xl sm:p-6'
						: ''}"
					onclick={(e) => {
						if (fullscreenChartIndex === 1 && e.target.tagName === 'CANVAS') return;
						toggleFullscreen(1);
					}}
				>
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium">Target Current Tracking & Deviation</Card.Title>
						{#if fullscreenChartIndex === 1}
							<Button
								variant="outline"
								size="sm"
								onclick={(e) => {
									e.stopPropagation();
									toggleFullscreen(1);
								}}
							>
								Close Fullscreen
							</Button>
						{/if}
					</Card.Header>
					<Card.Content
						class="relative w-full overflow-hidden {fullscreenChartIndex === 1
							? 'min-h-[500px] flex-1'
							: 'h-[300px]'}"
					>
						<canvas bind:this={canvas2}></canvas>
					</Card.Content>
				</Card.Root>

				<!-- Chart 3 -->
				<Card.Root
					class="flex cursor-pointer flex-col transition-all duration-300 ease-in-out hover:border-primary/50 hover:shadow-md {fullscreenChartIndex ===
					2
						? 'fixed inset-0 z-[50] m-0 h-screen w-screen rounded-none bg-background p-4 shadow-2xl sm:p-6'
						: ''}"
					onclick={(e) => {
						if (fullscreenChartIndex === 2 && e.target.tagName === 'CANVAS') return;
						toggleFullscreen(2);
					}}
				>
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium">AI Electrode Prediction Accuracy</Card.Title>
						{#if fullscreenChartIndex === 2}
							<Button
								variant="outline"
								size="sm"
								onclick={(e) => {
									e.stopPropagation();
									toggleFullscreen(2);
								}}
							>
								Close Fullscreen
							</Button>
						{/if}
					</Card.Header>
					<Card.Content
						class="relative w-full overflow-hidden {fullscreenChartIndex === 2
							? 'min-h-[500px] flex-1'
							: 'h-[300px]'}"
					>
						<canvas bind:this={canvas3}></canvas>
					</Card.Content>
				</Card.Root>

				<!-- Chart 4 -->
				<Card.Root
					class="flex cursor-pointer flex-col transition-all duration-300 ease-in-out hover:border-primary/50 hover:shadow-md {fullscreenChartIndex ===
					3
						? 'fixed inset-0 z-[50] m-0 h-screen w-screen rounded-none bg-background p-4 shadow-2xl sm:p-6'
						: ''}"
					onclick={(e) => {
						if (fullscreenChartIndex === 3 && e.target.tagName === 'CANVAS') return;
						toggleFullscreen(3);
					}}
				>
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium"
							>System Overview (Current & Potential)</Card.Title
						>
						{#if fullscreenChartIndex === 3}
							<Button
								variant="outline"
								size="sm"
								onclick={(e) => {
									e.stopPropagation();
									toggleFullscreen(3);
								}}
							>
								Close Fullscreen
							</Button>
						{/if}
					</Card.Header>
					<Card.Content
						class="relative w-full overflow-hidden {fullscreenChartIndex === 3
							? 'min-h-[500px] flex-1'
							: 'h-[300px]'}"
					>
						<canvas bind:this={canvas4}></canvas>
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	</main>
</div>
