import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const DISTANCE_NEAREST_PARCEL = 5;
const SPAWN_NON_SPAWN_RATIO = 0.5;
const DELIVERY_AREA_EXPLORE = 0.1;
const TIMED_EXPLORE = 0.99;
const MEMORY_DIFFERENCE_THRESHOLD = 2000;

class Queue {
	constructor() {
		this.items = [];
		this.head = 0;
		this.tail = 0;
	}

	enqueue(item) {
		this.items[this.tail++] = item;
	}

	dequeue() {
		if (this.isEmpty()) return undefined;
		const item = this.items[this.head];
		delete this.items[this.head];
		this.head++;
		return item;
	}

	isEmpty() {
		return this.head === this.tail;
	}

	size() {
		return this.tail - this.head;
	}
}

class GraphNode {
	constructor(type, x, y) {
		this.x = x;
		this.y = y;
		this.neighU = undefined;
		this.neighR = undefined;
		this.neighD = undefined;
		this.neighL = undefined;
		this.type = type;
		this.visitedDeliveries = []; // List of dictionaries containing {deliveryNode, distance, direction}
		this.nearestSpawn = undefined; // Nearest spawn area
		this.visitedSet = new Set(); // Set containing the delivery nodes that already visited this node
	}
}

class Graph {
	constructor(currentMap) {
		this.gameMap = currentMap;
		this.graphMap = [];
		this.agentsNearby = [];

		// Initialize matrix containing all the agents positions (0 -> no agent, 1 -> agent)
		for (let x = 0; x < this.gameMap.width; x++) {
			this.agentsNearby[x] = [];
			for (let y = 0; y < this.gameMap.height; y++) {
				this.agentsNearby[x][y] = 0;
			}
		}

		// Create graph nodes and save them into a matrix
		for (let x = 0; x < this.gameMap.width; x++) {
			this.graphMap[x] = [];
			for (let y = 0; y < this.gameMap.height; y++) {
				if (this.gameMap.getItem(x, y) == 0) {
					this.graphMap[x][y] = null;
				} else {
					this.graphMap[x][y] = new GraphNode(
						this.gameMap.getItem(x, y),
						x,
						y
					);
				}
			}
		}

		// Connect each graph node to its neighbors
		for (let x = 0; x < this.gameMap.width; x++) {
			for (let y = 0; y < this.gameMap.height; y++) {
				if (this.graphMap[x][y] != null) {
					// if neighbor in bound
					if (0 <= y + 1 && y + 1 < this.gameMap.height) {
						// if neighbor walkable
						if (this.graphMap[x][y + 1] != null) {
							// add up neighbor
							this.graphMap[x][y].neighU =
								this.graphMap[x][y + 1];
						}
					}

					// if neighbor in bound
					if (0 <= x + 1 && x + 1 < this.gameMap.width) {
						// if neighbor walkable
						if (this.graphMap[x + 1][y] != null) {
							// add right neighbor
							this.graphMap[x][y].neighR =
								this.graphMap[x + 1][y];
						}
					}

					// if neighbor in bound
					if (0 <= y - 1 && y - 1 < this.gameMap.height) {
						// if neighbor walkable
						if (this.graphMap[x][y - 1] != null) {
							// add down neighbor
							this.graphMap[x][y].neighD =
								this.graphMap[x][y - 1];
						}
					}

					// if neighbor in bound
					if (0 <= x - 1 && x - 1 < this.gameMap.width) {
						// if neighbor walkable
						if (this.graphMap[x - 1][y] != null) {
							// add left neighbor
							this.graphMap[x][y].neighL =
								this.graphMap[x - 1][y];
						}
					}
				}
			}
		}
		this.preprocess();
	}

	// Compute nearest delivery/spawn
	preprocess() {
		// Compute nearest delivery
		let queue = new Queue();
		this.gameMap.deliveryZones.forEach((element) => {
			// Insert delivery zones in the queue
			// Current: current node that we are exploring
			// Source: source delivery zone
			// Distance: distance from the source node
			// Direction: direction to reach the source
			queue.enqueue({
				current: this.graphMap[element.x][element.y],
				source: this.graphMap[element.x][element.y],
				distance: 0,
				direction: null,
			});

			while (!queue.isEmpty()) {
				let { current, source, distance, direction } = queue.dequeue();

				let sourceId = source.x + " " + source.y;
				// If the node not has not been visited
				if (!current.visitedSet.has(sourceId)) {
					// Visit it
					current.visitedSet.add(sourceId);
					current.visitedDeliveries.push({
						deliveryNode: source,
						distance: distance,
						direction: direction,
					});

					// Explore its neighbors
					// Up
					if (current.neighU != null) {
						queue.enqueue({
							current: current.neighU,
							source: source,
							distance: distance + 1,
							direction: "D",
						});
					}

					// Right
					if (current.neighR != null) {
						queue.enqueue({
							current: current.neighR,
							source: source,
							distance: distance + 1,
							direction: "L",
						});
					}

					// Down
					if (current.neighD != null) {
						queue.enqueue({
							current: current.neighD,
							source: source,
							distance: distance + 1,
							direction: "U",
						});
					}

					// Left
					if (current.neighL != null) {
						queue.enqueue({
							current: current.neighL,
							source: source,
							distance: distance + 1,
							direction: "R",
						});
					}
				}
			}
		});

		// Sort the deliveries on the distance for each node
		this.graphMap.forEach((row) => {
			row.forEach((element) => {
				if (element) {
					element.visitedDeliveries.sort((first, second) => {
						return first.distance - second.distance;
					});
				}
			});
		});
	}

	// Update the timestamp of the last visit for the visible cells at this location
	updateTimeMap(x, y) {
		let range = currentConfig.PARCELS_OBSERVATION_DISTANCE;
		let currentNode = this.graphMap[x][y];
		let time = Date.now();

		this.#recursiveTimeMap(currentNode, time, range);
	}

	resetAgentsNearby() {
		// Initialize matrix containing all the agents positions (0 -> no agent, 1 -> agent)
		for (let x = 0; x < this.gameMap.width; x++) {
			this.agentsNearby[x] = [];
			for (let y = 0; y < this.gameMap.height; y++) {
				this.agentsNearby[x][y] = 0;
			}
		}
	}

	#recursiveTimeMap(node, time, remainingRange) {
		// If not node already explored (same timestamp) and remaining range
		if (
			this.gameMap.timeMap[node.x][node.y] != time &&
			remainingRange > 0
		) {
			// Explore it
			this.gameMap.timeMap[node.x][node.y] = time;
			remainingRange--;

			// Explore neighbors
			// Explore its neighbors
			// Up
			if (node.neighU != null) {
				this.#recursiveTimeMap(node.neighU, time, remainingRange);
			}

			// Right
			if (node.neighR != null) {
				this.#recursiveTimeMap(node.neighR, time, remainingRange);
			}

			// Down
			if (node.neighD != null) {
				this.#recursiveTimeMap(node.neighD, time, remainingRange);
			}

			// Left
			if (node.neighL != null) {
				this.#recursiveTimeMap(node.neighL, time, remainingRange);
			}
		}
	}
}

class GameMap {
	constructor(width, height, tile) {
		// Take map in deliveroo format and convert it into matrix format
		this.width = width;
		this.height = height;
		this.map = [];
		this.timeMap = []; // Timestamp of last visit to the tile
		this.deliveryZones = [];
		this.deliveryZonesCounter = 0;
		this.spawnZones = [];
		this.spawnZonesCounter = 0;
		this.nonSpawnZones = [];
		this.nonSpawnZonesCounter = 0;

		for (let i = 0; i < width; i++) {
			this.map[i] = [];
			this.timeMap[i] = [];
		}

		for (let i = 0; i < width * height; i++) {
			let currentItem = tile[i];
			this.map[currentItem.x][currentItem.y] = currentItem;
			this.timeMap[currentItem.x][currentItem.y] = 0;
		}

		for (let x = 0; x < width; x++) {
			for (let y = 0; y < height; y++) {
				let valid = false;
				// check up
				if (y + 1 < height) {
					if (this.map[x][y + 1].type != 0) {
						valid = true;
					}
				}
				// check right
				if (x + 1 < width) {
					if (this.map[x + 1][y].type != 0) {
						valid = true;
					}
				}
				// check down
				if (y - 1 >= 0) {
					if (this.map[x][y - 1].type != 0) {
						valid = true;
					}
				}
				// check left
				if (x - 1 >= 0) {
					if (this.map[x - 1][y].type != 0) {
						valid = true;
					}
				}

				// If tile has no neighbors, then remove it as invalid
				if (valid) {
					if (this.map[x][y].type == 1) {
						// Spawn zone
						this.spawnZones.push({ ...this.map[x][y] });
						this.spawnZonesCounter++;
					} else if (this.map[x][y].type == 2) {
						// Delivery zone
						this.deliveryZones.push({ ...this.map[x][y] });
						this.deliveryZonesCounter++;
					} else if (this.map[x][y].type == 3) {
						// Delivery zone
						// this.nonSpawnZones.push({...this.map[x][y]});
						this.nonSpawnZonesCounter++;
					}
				} else {
					// Non walkable tile because no neighbors
					this.map[x][y].type = 0;
				}
			}
		}

		// Replace the whole tile item in the map with only the type for consistency
		for (let x = 0; x < width; x++) {
			for (let y = 0; y < height; y++) {
				this.map[x][y] = this.map[x][y].type;
			}
		}
	}

	getItem(x, y) {
		return this.map[x][y];
	}
}

class IntentionRevision {
	#intention_queue = new Array();
	get intention_queue() {
		return this.#intention_queue;
	}

	async loop() {
		while (true) {
			// Consumes intention_queue if not empty
			if (this.intention_queue.length > 0) {
				console.log(
					"intentionRevision.loop",
					this.intention_queue.map((i) => i.predicate)
				);

				// Current intention
				const intention = this.intention_queue[0];

				// Is queued intention still valid? Do I still want to achieve it?
				// TODO this hard-coded implementation is an example
				let id = intention.predicate[2];
				let p = parcels.get(id);
				if (p && p.carriedBy) {
					console.log(
						"Skipping intention because no more valid",
						intention.predicate
					);
					continue;
				}

				// Start achieving intention
				await intention
					.achieve()
					// Catch eventual error and continue
					.catch((error) => {
						// console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
					});

				// Remove from the queue
				this.intention_queue.shift();
				optionsGeneration();
			}
			// Postpone next iteration at setImmediate
			await new Promise((res) => setImmediate(res));
		}
	}

	// async push ( predicate ) { }

	log(...args) {
		console.log(...args);
	}

	stopCurrentTask() {
		let last = this.intention_queue.at(this.intention_queue.length - 1);
		console.log("MANUALLY STOPPED TASK");
		last.stop();
	}
}

class IntentionRevisionReplace extends IntentionRevision {
	async push(predicate) {
		// Check if already queued
		const last = this.intention_queue.at(this.intention_queue.length - 1);
		if (last && last.predicate.join(" ") == predicate.join(" ")) {
			return; // intention is already being achieved
		}

		console.log("IntentionRevisionReplace.push", predicate);
		const intention = new Intention(this, predicate);
		this.intention_queue.push(intention);

		// Force current intention stop
		if (last) {
			last.stop();
		}
	}
}

class Intention {
	// Plan currently used for achieving the intention
	#current_plan;

	// This is used to stop the intention
	#stopped = false;
	get stopped() {
		return this.#stopped;
	}
	stop() {
		// this.log( 'stop intention', ...this.#predicate );
		this.#stopped = true;
		if (this.#current_plan) this.#current_plan.stop();
	}

	/**
	 * #parent refers to caller
	 */
	#parent;

	/**
	 * @type { any[] } predicate is in the form ['go_to', x, y]
	 */
	get predicate() {
		return this.#predicate;
	}
	/**
	 * @type { any[] } predicate is in the form ['go_to', x, y]
	 */
	#predicate;

	constructor(parent, predicate) {
		this.#parent = parent;
		this.#predicate = predicate;
	}

	log(...args) {
		if (this.#parent && this.#parent.log) this.#parent.log("\t", ...args);
		else console.log(...args);
	}

	#started = false;
	/**
	 * Using the plan library to achieve an intention
	 */
	async achieve() {
		// Cannot start twice
		if (this.#started) return this;
		else this.#started = true;

		// Trying all plans in the library
		for (const planClass of planLibrary) {
			// if stopped then quit
			if (this.stopped) throw ["stopped intention", ...this.predicate];

			// if plan is 'statically' applicable
			if (planClass.isApplicableTo(...this.predicate)) {
				// plan is instantiated
				this.#current_plan = new planClass(this.#parent);
				this.log(
					"achieving intention",
					...this.predicate,
					"with plan",
					planClass.name
				);
				// and plan is executed and result returned
				try {
					const plan_res = await this.#current_plan.execute(
						...this.predicate
					);
					this.log(
						"successful intention",
						...this.predicate,
						"with plan",
						planClass.name,
						"with result:",
						plan_res
					);
					return plan_res;
					// or errors are caught so to continue with next plan
				} catch (error) {
					this.log(
						"failed intention",
						...this.predicate,
						"with plan",
						planClass.name,
						"with error:",
						error
					);
				}
			}
		}

		// if stopped then quit
		if (this.stopped) throw ["stopped intention", ...this.predicate];

		// no plans have been found to satisfy the intention
		// this.log( 'no plan satisfied the intention ', ...this.predicate );
		throw ["no plan satisfied the intention ", ...this.predicate];
	}
}

class Plan {
	// This is used to stop the plan
	#stopped = false;
	stop() {
		// this.log( 'stop plan' );
		this.#stopped = true;
		for (const i of this.#sub_intentions) {
			i.stop();
		}
	}
	get stopped() {
		return this.#stopped;
	}

	/**
	 * #parent refers to caller
	 */
	#parent;

	constructor(parent) {
		this.#parent = parent;
	}

	log(...args) {
		if (this.#parent && this.#parent.log) this.#parent.log("\t", ...args);
		else console.log(...args);
	}

	// this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
	#sub_intentions = [];

	async subIntention(predicate) {
		const sub_intention = new Intention(this, predicate);
		this.#sub_intentions.push(sub_intention);
		return sub_intention.achieve();
	}
}

class GoPickUp extends Plan {
	static isApplicableTo(go_pick_up, x, y, id) {
		return (
			go_pick_up ==
			"go_pick_up" /*|| go_pick_up == "emergency_go_pick_up"*/
		);
	}

	async execute(go_pick_up, x, y) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await this.subIntention(["go_to", x, y]);
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await client.emitPickup();
		reviseMemory();
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

class GoDeliver extends Plan {
	static isApplicableTo(go_deliver) {
		return go_deliver == "go_deliver";
	}

	async execute(go_deliver) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit

		let nearestDelivery =
			grafo.graphMap[Math.round(me.x)][Math.round(me.y)]
				.visitedDeliveries[0].deliveryNode;

		await this.subIntention([
			"go_to",
			nearestDelivery.x,
			nearestDelivery.y,
		]);
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await client.emitPutdown();
		reviseMemory();
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

class Explore extends Plan {
	static isApplicableTo(explore) {
		return explore == "explore";
	}

	async execute(explore, type) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		let coords;

		if (type == "timed") {
			coords = timedExplore();
		} else if (type == "distance") {
			coords = distanceExplore();
		}

		// When a valid cell has been found, move to it (and hope to find something interesting)
		await this.subIntention(["go_to", coords[0], coords[1]]);
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

class BlindBFSmove extends Plan {
	static isApplicableTo(go_to, x, y) {
		return go_to == "go_to";
	}

	async execute(go_to, x, y) {
		let path = navigateBFS([Math.round(me.x), Math.round(me.y)], [x, y]);

		// If no path applicable, then select another cell and go to explore (to not remain still)
		if (path == undefined) {
			path = navigateBFS(
				[Math.round(me.x), Math.round(me.y)],
				distanceExplore()
			);
		}

		let i = 0;
		while (i < path.length) {
			if (this.stopped) throw ["stopped"]; // if stopped then quit

			let moved_horizontally;
			let moved_vertically;

			// this.log('me', me, 'xy', x, y);

			if (path[i] == "R") {
				moved_horizontally = await client.emitMove("right");
				// status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
			} else if (path[i] == "L") {
				moved_horizontally = await client.emitMove("left");
				// status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );
			}

			if (moved_horizontally) {
				me.x = moved_horizontally.x;
				me.y = moved_horizontally.y;
			}

			if (this.stopped) throw ["stopped"]; // if stopped then quit

			if (path[i] == "U") {
				moved_vertically = await client.emitMove("up");
				// status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
			} else if (path[i] == "D") {
				moved_vertically = await client.emitMove("down");
				// status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );
			}

			if (moved_vertically) {
				me.x = moved_vertically.x;
				me.y = moved_vertically.y;
			}

			// If stucked
			if (!moved_horizontally && !moved_vertically) {
				return true;
				//throw 'stucked';
			} else if (me.x == x && me.y == y) {
				// this.log('target reached');
			}

			i++;
			// After motion update the timestamp of the visited cells
			grafo.updateTimeMap(me.x, me.y);
		}
		return true;
	}
}

function distanceExplore() {
	let suitableCells = undefined;
	// Check spawn/non spawn ratio, if larger than SPAWN_NON_SPAWN_RATIO
	if (
		grafo.gameMap.spawnZonesCounter / grafo.gameMap.nonSpawnZonesCounter >
		SPAWN_NON_SPAWN_RATIO
	) {
		// Consider also delivery zones for the explore
		let deliveryOrSpawn = Math.random();
		if (deliveryOrSpawn < DELIVERY_AREA_EXPLORE) {
			// Explore only deliveries zones
			suitableCells = grafo.gameMap.deliveryZones;
		} else {
			// Explore only spawning zones
			suitableCells = grafo.gameMap.spawnZones;
		}
	} else {
		// Consider only spawning tiles for explore
		suitableCells = grafo.gameMap.spawnZones;
	}

	// Recover all suitable tiles for explore (spawning)
	let totalDistance = 0;
	let randX = undefined;
	let randY = undefined;

	// Compute distances
	suitableCells.forEach((element) => {
		element.distance = distance(
			{ x: me.x, y: me.y },
			{ x: element.x, y: element.y }
		);
		totalDistance += element.distance;
	});

	// Normalize distances
	suitableCells.forEach((element) => {
		element.distance = element.distance / totalDistance;
	});

	let randomValue = Math.random();

	// Recover selected element
	suitableCells.forEach((element) => {
		// If we haven't selected a suitable cell
		if (!randX) {
			// Try to find one with a probability proportional to its distance (distant cells are more probable)
			randomValue -= element.distance;
			if (randomValue <= 0) {
				// Recover the element
				randX = element.x;
				randY = element.y;
				return;
			}
		}
	});
	return [randX, randY];
}

function timedExplore() {
	let suitableCells = undefined;
	// Check spawn/non spawn ratio, if larger than SPAWN_NON_SPAWN_RATIO
	if (
		grafo.gameMap.spawnZonesCounter / grafo.gameMap.nonSpawnZonesCounter >
		SPAWN_NON_SPAWN_RATIO
	) {
		// Explore only spawning zones
		suitableCells = grafo.gameMap.spawnZones;
		/*
		if (Math.random() < DELIVERY_AREA_EXPLORE) {
			// Explore only deliveries zones
			suitableCells = grafo.gameMap.deliveryZones;
		} else {
			// Explore only spawning zones
			suitableCells = grafo.gameMap.spawnZones;
		}
    */
	} else {
		// Consider only spawning tiles for explore
		suitableCells = grafo.gameMap.spawnZones;
	}
	let tmp = [];
	// Do not consider current cell
	for (let i = 0; i < suitableCells.length; i++) {
		if (
			suitableCells[i].x == Math.round(me.x) &&
			suitableCells[i].y == Math.round(me.y)
		) {
			continue;
		}

		tmp.push(suitableCells[i]);
	}
	suitableCells = tmp;

	// Recover all suitable tiles for explore
	let totalTime = 0;
	let now = Date.now();
	let randX = undefined;
	let randY = undefined;

	// Compute the last time a tile was visited
	suitableCells.forEach((element) => {
		element.timestamp = now - grafo.gameMap.timeMap[element.x][element.y];
		element.distance = distance(
			{ x: me.x, y: me.y },
			{ x: element.x, y: element.y }
		);
		totalTime += element.timestamp;
	});

	// Normalize timestamp
	suitableCells.forEach((element) => {
		element.timestamp /= totalTime; // First normalization
		element.timestamp /=
			element.distance *
				element.distance *
				element.distance *
				element.distance +
			1; // Penalize distant cells
	});

	// Second normalization
	totalTime = 0;
	suitableCells.forEach((element) => {
		totalTime += element.timestamp;
	});

	suitableCells.forEach((element) => {
		element.timestamp /= totalTime;
	});
	let randomValue = Math.random();

	// Recover selected element
	suitableCells.forEach((element) => {
		// If we haven't selected a suitable cell
		if (!randX) {
			// Try to find one with a probability proportional to its its timestamp (the bigger the time the more probable)
			randomValue -= element.timestamp;
			if (randomValue <= 0) {
				// Recover the element
				randX = element.x;
				randY = element.y;
				return;
			}
		}
	});

	// If timed explore failed (sometimes happens a NaN error somewhere and we don't know why)
	if (randX == undefined || randY == undefined) {
		// If this happens, select a random cell to explore based on distance
		return distanceExplore();
	}
	return [randX, randY];
}

/**
 *
 * @param {[int, int]} initialPos
 * @param {[int, int]} finalPos
 * @returns
 */
function navigateBFS(initialPos, finalPos) {
	let queue = new Queue();
	let explored = new Set();
	let finalPath = undefined;

	let initialNode = grafo.graphMap[initialPos[0]][initialPos[1]];

	if (initialNode == undefined) {
		return undefined;
	}

	// Add initial node to the queue
	queue.enqueue({ currentNode: initialNode, path: [] });

	// Cycle until the queue is empty or a valid path has been found
	while (!queue.isEmpty()) {
		// Take the item from the queue
		let { currentNode, path } = queue.dequeue();

		// If the current position is the final position return the path
		if (currentNode.x == finalPos[0] && currentNode.y == finalPos[1]) {
			// Check if in the final node there is no other agent
			if (
				grafo.agentsNearby != undefined &&
				grafo.agentsNearby[currentNode.x][currentNode.y] == 1
			) {
				// Agent
				finalPath = undefined;
			} else {
				// No agent
				finalPath = path;
			}
			break;
		}

		let currentNodeId = currentNode.x + " " + currentNode.y;

		// If the node not has not been visited
		if (!explored.has(currentNodeId)) {
			// Visit it
			explored.add(currentNodeId);

			// If node is occupied, ignore its neighbors
			if (
				grafo.agentsNearby != undefined &&
				grafo.agentsNearby[currentNode.x][currentNode.y] == 1
			) {
				continue;
			}

			// Explore its neighbors
			// Up
			if (currentNode.neighU != null) {
				let tmp = path.slice();
				tmp.push("U");
				queue.enqueue({ currentNode: currentNode.neighU, path: tmp });
			}

			// Right
			if (currentNode.neighR != null) {
				let tmp = path.slice();
				tmp.push("R");
				queue.enqueue({ currentNode: currentNode.neighR, path: tmp });
			}

			// Down
			if (currentNode.neighD != null) {
				let tmp = path.slice();
				tmp.push("D");
				queue.enqueue({ currentNode: currentNode.neighD, path: tmp });
			}

			// Left
			if (currentNode.neighL != null) {
				let tmp = path.slice();
				tmp.push("L");
				queue.enqueue({ currentNode: currentNode.neighL, path: tmp });
			}
		}
	}

	// If there exists a path from the initial to the final tile
	if (finalPath != undefined) {
		return finalPath;
	} else {
		console.log(
			"No path found to [" + finalPos[0] + "," + finalPos[1] + "]!"
		);
		return undefined;
	}
}

function expectedRewardOfCarriedParcels(carriedParcels, path) {
	let totalScore = 0;
	carriedParcels.forEach((parcel) => {
		totalScore += parcelScoreAfterMsPath(path, parcel.reward, Date.now());
	});
	return totalScore;
}

function expectedRewardCarriedAndPickup(carriedParcels, parcel2Pickup) {
	let pickUpReward = parcelCostReward(parcel2Pickup);

	// If we can reach the parcel to pickup
	if (
		pickUpReward.pathToDeliver != Infinity &&
		pickUpReward.pathToParcel != Infinity &&
		pickUpReward != 0
	) {
		// Compute expected reward for the carried parcels
		let totalScore =
			pickUpReward.expectedReward +
			expectedRewardOfCarriedParcels(
				carriedParcels,
				pickUpReward.pathToParcel.concat(pickUpReward.pathToDeliver)
			);

		// Return the final expected score
		return totalScore;
	} else {
		// Else no reward
		return 0;
	}
}

function optionsGeneration() {
	/**
	 * Options generation
	 */
	// Recover all the parcels I am carrying and the path to the nearest delivery
	let carriedParcels = [];
	parcels.forEach((parcel) => {
		if (parcel.carriedBy == me.id) {
			carriedParcels.push(parcel);
		}
	});

	let pathNearestDelivery = navigateBFS(
		[Math.round(me.x), Math.round(me.y)],
		[
			grafo.graphMap[Math.round(me.x)][Math.round(me.y)]
				.visitedDeliveries[0].deliveryNode.x,
			grafo.graphMap[Math.round(me.x)][Math.round(me.y)]
				.visitedDeliveries[0].deliveryNode.y,
		]
	);

	const options = [];
	for (const parcel of parcels.values()) {
		if (!parcel.carriedBy) {
			if (parcel.x == Math.round(me.x) && parcel.y == Math.round(me.y)) {
				options.push([
					"go_pick_up",
					parcel.x, // X coord
					parcel.y, // Y coord
					parcel.id, // ID
					Infinity, // Expected reward if picked up
				]);
			} else {
				options.push([
					"go_pick_up",
					parcel.x, // X coord
					parcel.y, // Y coord
					parcel.id, // ID
					expectedRewardCarriedAndPickup(carriedParcels, parcel), // Expected reward if picked up
				]);
			}
		}
	}

	if (carriedParcels.length != 0) {
		if (
			grafo.gameMap.getItem(Math.round(me.x), Math.round(me.y)).type == 2
		) {
			options.push(["go_deliver", Infinity]);
		} else {
			options.push([
				"go_deliver",
				expectedRewardOfCarriedParcels(
					carriedParcels,
					pathNearestDelivery
				),
			]);
		}
	}

	/**
	 * Options filtering
	 */
	let best_option = undefined;
	let maxExpectedScore = 0;

	options.forEach((option) => {
		let currentExpectedScore = 0;
		if (option[0] == "go_pick_up") {
			currentExpectedScore = option[4];
		} else if (option[0] == "go_deliver") {
			currentExpectedScore = option[1];
		}

		if (currentExpectedScore > maxExpectedScore) {
			maxExpectedScore = currentExpectedScore;
			best_option = option;
		}
	});

	/*
	let best_option;
	let nearest = Number.MAX_VALUE;
	let delivery_d;

	for (const option of options) {
		if (option[0] == "go_pick_up") {
			let [go_pick_up, x, y, id] = option;
			let current_d = navigateBFS(
				[Math.round(me.x), Math.round(me.y)],
				[x, y]
			);
			if (current_d != undefined) {
				current_d = current_d.length;
				if (current_d < nearest) {
					if (
						best_option == undefined ||
						(best_option[0] != "go_deliver" &&
							best_option[0] != "emergency_go_pick_up")
					) {
						best_option = option;
						nearest = current_d;
					} else {
						delivery_d =
							grafo.graphMap[Math.round(me.x)][Math.round(me.y)]
								.visitedDeliveries[0].distance;
						if (
							current_d < DISTANCE_NEAREST_PARCEL &&
							current_d < delivery_d
						) {
							option[0] = "emergency_go_pick_up";
							best_option = option;
							nearest = current_d;
						}
					}
				}
			}
		} else if (option[0] == "go_deliver") {
			if (
				best_option == undefined ||
				best_option[0] != "emergency_go_pick_up"
			) {
				best_option = option;
			}
		}
	}
	*/
	/**
	 * Best option is selected
	 */
	if (best_option) {
		myAgent.push(best_option);
	} else {
		// If we don't have a valid best option, then explore
		if (Math.random() < TIMED_EXPLORE) {
			// Explore oldest tiles
			myAgent.push(["explore", "timed"]);
		} else {
			// Explore distant tiles
			myAgent.push(["explore", "distance"]);
		}
	}
}

function parcelCostReward(parcel) {
	let parX = parcel.x;
	let parY = parcel.y;
	let parScore = parcel.reward;
	let lastVisitTime = parcel.time;

	// Compute distance agent -> parcel
	let pathToParcel = navigateBFS(
		[Math.round(me.x), Math.round(me.y)],
		[parX, parY]
	);

	if (pathToParcel == undefined) {
		return {
			pathToParcel: undefined,
			pathToDeliver: undefined,
			expectedReward: 0,
		};
	}

	// Compute distance parcel -> nearest delivery
	let nearestDelivery =
		grafo.graphMap[parX][parY].visitedDeliveries[0].deliveryNode;

	let pathToDeliver = navigateBFS(
		[parX, parY],
		[nearestDelivery.x, nearestDelivery.y]
	);

	if (pathToDeliver == undefined) {
		return {
			pathToParcel: undefined,
			pathToDeliver: undefined,
			expectedReward: 0,
		};
	}

	// Compute expected reward for [parX, parY] parcel
	let expectedReward = parcelScoreAfterMsPath(
		pathToParcel.concat(pathToDeliver),
		parScore,
		lastVisitTime
	);

	// Return paths a->p, p->d, expected reward
	return {
		pathToParcel: pathToParcel,
		pathToDeliver: pathToDeliver,
		expectedReward: expectedReward,
	};
}

function parcelScoreAfterMs(time, parcelScore, lastVisitTime) {
	let decadeInterval = currentConfig.PARCEL_DECADING_INTERVAL; //Seconds

	if (decadeInterval == "infinite") {
		decadeInterval = Infinity;
	} else {
		decadeInterval = Number(
			decadeInterval.substring(0, decadeInterval.length - 1)
		);
	}
	decadeInterval *= 1000; // Converte to ms
	let marginedTime = time + Number(currentConfig.MOVEMENT_DURATION); // Add some additional time margin
	let scoreCost = Math.round(marginedTime / decadeInterval);

	// Compute last visit time
	let timeDifference = Date.now() - lastVisitTime;

	// Compute approximate score difference from lastVisitTime
	let scoreDiff = Math.round(timeDifference / decadeInterval);

	// Return expected reward for parcel
	let expected = parcelScore - scoreCost - scoreDiff;
	if (expected < 0) {
		expected = 0;
	}
	return expected;
}

function parcelScoreAfterMsPath(path, parcelScore, lastVisitTime) {
	return parcelScoreAfterMs(
		path.length * currentConfig.MOVEMENT_DURATION,
		parcelScore,
		lastVisitTime
	);
}

function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
	const dx = Math.abs(Math.round(x1) - Math.round(x2));
	const dy = Math.abs(Math.round(y1) - Math.round(y2));
	return dx + dy;
}

function reviseMemory() {
	let parcels2 = new Map();
	let stopFlag = false;

	// Revise memory information
	parcels.forEach((parcel) => {
		// Check if I see old parcels position
		if (
			distance({ x: parcel.x, y: parcel.y }, { x: me.x, y: me.y }) <
			currentConfig.PARCELS_OBSERVATION_DISTANCE
		) {
			// Check if I saw the parcel recently (aka. the onParcelSensing was called by it)
			if (Date.now() - parcel.time < MEMORY_DIFFERENCE_THRESHOLD) {
				// If so, preserve it
				parcels2.set(parcel.id, parcel);
			} else {
				stopFlag = true;
			}
		} else {
			parcels2.set(parcel.id, parcel);
		}
	});
	parcels = parcels2;

	// Check if I see old agents position
	// Check if agent is still there
	// If not, remove, stop current intent

	// If the memory has been updated
	if (stopFlag) {
		// Stop current intention and revise
		// myAgent.stopCurrentTask();
	}

	optionsGeneration();
}
/*
// NAME: random
const client = new DeliverooApi(
	"http://localhost:8080",
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjdkNTQxMiIsIm5hbWUiOiJSQU5ET00iLCJyb2xlIjoidXNlciIsImlhdCI6MTc0NjQzNDk4Nn0.RjxCO6QW8s9a-ZgaWTgIhjwCdqvC-A6ufNRUhE3qhEw"
);
*/

// NAME: timed
const client = new DeliverooApi(
	"http://localhost:8080",
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZlMTFlZCIsIm5hbWUiOiJUSU1FRCIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ2NDM1MDE4fQ.cut9jChHGlJhpuR94h9x1H71mNGFQ6Bt-q76uX_wlrA"
);

const me = {
	id: null,
	name: null,
	x: null,
	y: null,
	score: null,
};
const myAgent = new IntentionRevisionReplace();
const planLibrary = [];

// Parcels belief set
var parcels = new Map();
var agents = new Map();

var currentMap = undefined;
var grafo = undefined;
var currentConfig = undefined;

// Plan classes are added to plan library
planLibrary.push(GoPickUp);
planLibrary.push(BlindBFSmove);
planLibrary.push(GoDeliver);
planLibrary.push(Explore);

client.onParcelsSensing(async (pp) => {
	// Add the sensed parcels to the parcel belief set
	let now = Date.now();
	for (const p of pp) {
		parcels.set(p.id, {
			id: p.id,
			x: p.x,
			y: p.y,
			carriedBy: p.carriedBy,
			reward: p.reward,
			time: now,
		});
	}

	for (const [id, parcel] of parcels) {
		if (parcel.carriedBy == me.id && parcel.time != now) {
			parcels.delete(id);
		}
	}
});

client.onAgentsSensing(async (aa) => {
	// Add the sensed agents to the agent belief set

	aa.forEach((a) => {
		agents.set(a.id, a);
	});

	// DA MODIFICARE
	for (const a of agents.values()) {
		if (aa.map((a) => a.id).find((id) => id == a.id) == undefined) {
			agents.delete(a.id);
			if (grafo.agentsNearby != undefined) {
				grafo.agentsNearby[Math.round(a.x)][Math.round(a.y)] = 0;
			}
		}
	}

	grafo.resetAgentsNearby();

	// Add the agents to the matrix
	for (const a of agents) {
		if (grafo.agentsNearby != undefined) {
			grafo.agentsNearby[Math.round(a[1].x)][Math.round(a[1].y)] = 1;
		}
	}
});

client.onYou(({ id, name, x, y, score }) => {
	// Set agent information
	me.id = id;
	me.name = name;
	me.x = x;
	me.y = y;
	me.score = score;

	reviseMemory();
});

client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);

myAgent.loop();

await new Promise((res) => {
	// Get the map information
	client.onMap((width, height, tile) => {
		currentMap = new GameMap(width, height, tile);
		grafo = new Graph(currentMap);
		res();
	});

	// Get the configuration
	client.onConfig((config) => {
		currentConfig = config;
		res();
	});
});
