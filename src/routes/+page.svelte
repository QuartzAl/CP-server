<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tabs from '$lib/components/ui/tabs';
	import {
		Activity,
		ChevronDown,
		Plus,
		BrainCircuit,
		Download,
		Loader2,
		Send
	} from 'lucide-svelte';
	import type { SensorData } from '$lib/types/index';

	// --- State Management ---

	let nodes = [
		{ id: '001', name: 'Pipeline Rungkut - Sec Kalirungkut', location: 'North Field' },
		{ id: 'node-beta', name: 'Beta Pipeline - Sec 2B', location: 'East Valley' },
		{ id: 'node-gamma', name: 'Gamma Station - Main', location: 'Central Hub' }
	];

	let selectedNodeId = $state(nodes[0].id);
	let selectedNode = $derived(nodes.find((n) => n.id === selectedNodeId) || nodes[0]);
	let timespan = $state('1h');
	let intervalID: any;

	let canvas1, canvas2, canvas3, canvas4;
	let charts: any[] = [];

	let isChartJsLoaded = $state(false);
	let isAddingNode = false;

	let isFetchingData = $state(false);
	let isInitialLoad = $state(true);

	let data = $state<SensorData | null>(null);

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

	// Reactively re-render chart whenever shadcn Tabs or Dropdown values change
	$effect(() => {
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
		console.log(dataSnapshot);

		// If data isn't loaded yet or arrays are empty, exit safely
		if (!dataSnapshot || !dataSnapshot.labels || dataSnapshot.labels.length === 0) return;

		// 2. Calculate derived metrics using only the snapshot
		const processed = {
			...dataSnapshot,
			resistance: [],
			deviation: [],
			TbusI: dataSnapshot.TbusI || []
		};

		for (let i = 0; i < dataSnapshot.labels.length; i++) {
			// Fallback target current calculation if API doesn't provide one
			if (processed.TbusI[i] === undefined) {
				processed.TbusI[i] = dataSnapshot.busI[i] ? dataSnapshot.busI[i] * 0.95 : 12;
			}

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
			// Chart 1 Update
			charts[0].data.labels = dataSnapshot.labels;
			charts[0].data.datasets[0].data = dataSnapshot.busV;
			charts[0].data.datasets[1].data = dataSnapshot.busI;
			charts[0].data.datasets[2].data = dataSnapshot.humidity;
			charts[0].data.datasets[3].data = processed.resistance;

			// Chart 2 Update
			charts[1].data.labels = dataSnapshot.labels;
			charts[1].data.datasets[0].data = dataSnapshot.busI;
			charts[1].data.datasets[1].data = processed.TbusI;
			charts[1].data.datasets[2].data = processed.deviation;

			// Chart 3 Update
			charts[2].data.labels = dataSnapshot.labels;
			charts[2].data.datasets[0].data = dataSnapshot.electrodeV;
			charts[2].data.datasets[1].data = dataSnapshot.predictedV;

			// Chart 4 Update
			charts[3].data.labels = dataSnapshot.labels;
			charts[3].data.datasets[0].data = dataSnapshot.busI;
			charts[3].data.datasets[1].data = processed.TbusI;
			charts[3].data.datasets[2].data = dataSnapshot.electrodeV;
			charts[3].data.datasets[3].data = dataSnapshot.predictedV;

			// Tell Chart.js to animate the new data points in seamlessly
			charts.forEach((c) => c.update()); // Use 'none' or 'resize' to prevent jarring animation snaps
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

		// --- Chart 1: Bus V, Bus I, Soil Humidity, Resistance ---
		// @ts-ignore
		charts.push(
			new Chart(canvas1.getContext('2d'), {
				type: 'line',
				data: {
					labels: dataSnapshot.labels,
					datasets: [
						{
							label: 'Voltage (V)',
							data: dataSnapshot.busV,
							borderColor: '#eab308',
							yAxisID: 'yV',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0
						},
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
							label: 'Humidity (%)',
							data: dataSnapshot.humidity,
							borderColor: '#22c55e',
							yAxisID: 'yH',
							tension: 0.4,
							borderWidth: 2,
							pointRadius: 0,
							borderDash: [5, 5]
						},
						{
							label: 'Resistance (Ω)',
							data: processed.resistance,
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
						yH: { display: false },
						yR: { display: false }
					}
				}
			})
		);

		// --- Chart 2: Bus Current, Target Current, Deviation ---
		// @ts-ignore
		charts.push(
			new Chart(canvas2.getContext('2d'), {
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
							data: processed.deviation,
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
							title: { display: true, text: 'Deviation' }
						}
					}
				}
			})
		);

		// --- Chart 3: Electrode V & AI Predicted V ---
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

		// --- Chart 4: Current, Target, Electrode, Predicted ---
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
			// The reactive statement $: if(isChartJsLoaded) will handle the initial render now
		};
		document.head.appendChild(script);
		// fetchRealData(timespan, selectedNodeId);
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

	function handleAddNode() {
		isAddingNode = true;
		setTimeout(() => {
			alert("This action would trigger the 'Add New ICCP Node' configuration modal or page.");
			isAddingNode = false;
		}, 100);
	}
</script>

<div class="min-h-screen bg-background font-sans text-foreground">
	<!-- STREAMING_CHUNK:Header & Navigation -->
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
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					{#snippet child({ props })}
						<Button {...props} variant="outline" class="gap-2 rounded-full">
							<span class="max-w-[150px] truncate sm:max-w-xs">{selectedNode.name}</span>
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
					<!-- RadioGroup binds directly to our selectedNodeId state -->
					<DropdownMenu.RadioGroup bind:value={selectedNodeId}>
						{#each nodes as node}
							<DropdownMenu.RadioItem value={node.id} class="cursor-pointer">
								<div class="flex w-full flex-col">
									<span>{node.name}</span>
									<span class="text-xs text-muted-foreground">{node.location}</span>
								</div>
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
					<DropdownMenu.Separator />
					<DropdownMenu.Item
						class="cursor-pointer font-medium text-primary"
						on:click={handleAddNode}
					>
						<Plus class="mr-2 h-4 w-4" />
						Add New Node...
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>

	<!-- STREAMING_CHUNK:Main Content Area -->
	<main class="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
		<!-- Header & Timespan Controls -->
		<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
			<div>
				<h2 class="text-2xl font-bold">{selectedNode.name}</h2>
				<p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
					<span class="relative flex h-2 w-2">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
						></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
					</span>
					Live Data Monitoring • {selectedNode.location}
				</p>
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
						Manually set the target current (mA) for {selectedNode.name}
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
							class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-[150px]"
							min="0"
							max="10000"
						/>
						<Button
							size="sm"
							onclick={handleSetTargetCurrent}
							disabled={isSendingCommand || targetCurrentInput === ''}
						>
							{#if isSendingCommand}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								Sending
							{:else}
								Set Target
							{/if}
						</Button>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- STREAMING_CHUNK:System Status Cards -->
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
						{data?.busV?.[0]?.toFixed(2) ?? 'N/A'}
						<span class="text-sm font-normal text-muted-foreground">V</span>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<div class="h-2 w-2 rounded-full bg-red-500"></div>
						Bus Current
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						{data?.busI?.[0]?.toFixed(2) ?? 'N/A'}
						<span class="text-sm font-normal text-muted-foreground">mA</span>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<div class="h-2 w-2 rounded-full bg-blue-500"></div>
						Current Electrode
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">
						{data?.electrodeV?.[0]?.toFixed(2) ?? 'N/A'}
						<span class="text-sm font-normal text-muted-foreground">V</span>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Custom styled shadcn Card for AI feature -->
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
						{data?.predictedV?.[0]?.toFixed(2) ?? 'N/A'}
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
						<Loader2 class="mb-4 h-8 w-8 animate-spin text-primary" />
						<span class="text-sm font-medium">
							{!isChartJsLoaded ? 'Initializing Charting Engine...' : 'Fetching Live Data...'}
						</span>
					</div>
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<!-- Chart 1 -->
				<Card.Root class="flex flex-col">
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium">Power & Environmental Constraints</Card.Title>
					</Card.Header>
					<Card.Content class="relative h-[300px] flex-1">
						<canvas bind:this={canvas1}></canvas>
					</Card.Content>
				</Card.Root>

				<!-- Chart 2 -->
				<Card.Root class="flex flex-col">
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium">Target Current Tracking & Deviation</Card.Title>
					</Card.Header>
					<Card.Content class="relative h-[300px] flex-1">
						<canvas bind:this={canvas2}></canvas>
					</Card.Content>
				</Card.Root>

				<!-- Chart 3 -->
				<Card.Root class="flex flex-col">
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium">AI Electrode Prediction Accuracy</Card.Title>
					</Card.Header>
					<Card.Content class="relative h-[300px] flex-1">
						<canvas bind:this={canvas3}></canvas>
					</Card.Content>
				</Card.Root>

				<!-- Chart 4 -->
				<Card.Root class="flex flex-col">
					<Card.Header class="flex flex-row items-center justify-between pb-2">
						<Card.Title class="text-sm font-medium"
							>System Overview (Current & Potential)</Card.Title
						>
					</Card.Header>
					<Card.Content class="relative h-[300px] flex-1">
						<canvas bind:this={canvas4}></canvas>
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	</main>
</div>
