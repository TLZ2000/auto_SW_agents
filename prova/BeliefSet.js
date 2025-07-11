import { GameMap } from "./GameMap.js";
import { Queue } from "./Queue.js";

export class BeliefSet {
	#game_map = null;
	#agent_memory = null;
	#parcel_memory = null;
	#me_memory = null;
	#pal_memory = null;
	#parcels_to_ignore = null;
	#game_config = null;
	#carried_parcels = null;
	#time_map = null; // Timestamp of last visit to the tile
	#agents_map = null;

	constructor() {
		this.#agent_memory = new Map();
		this.#parcel_memory = new Map();
		this.#me_memory = {
			id: null,
			name: null,
			x: null,
			y: null,
			score: null,
			moves: 0,
			msgId: 0,
			token: null,

			//TODO: riguardare questi se servono
			initialPathXPosition: undefined,
			initialPathYPosition: undefined,
			currentPath: undefined,
			initialPathTime: null,
			pendingOptionRequest: false,
			pendingBumpOptionRequest: false,
			pendingBumpRequest: false,
			bumping: false,
			stoppedIntention: null,
			stopMovementAction: false,
		};
		this.#pal_memory = {
			id: null,
			name: null,
			x: null,
			y: null,
			score: null,
			moves: 0,
			msgId: 0,
			token: null,

			//TODO: riguardare questi se servono
			initialPathXPosition: undefined,
			initialPathYPosition: undefined,
			currentPath: undefined,
			initialPathTime: null,
			pendingOptionRequest: false,
			pendingBumpOptionRequest: false,
			pendingBumpRequest: false,
			bumping: false,
			stoppedIntention: null,
			stopMovementAction: false,
		};
		this.#parcels_to_ignore = new Map();
		this.#carried_parcels = new Map();
		this.#time_map = [];
		this.#agents_map = [];
	}

	instantiateGameMap(width, height, tile) {
		this.#game_map = new GameMap(width, height, tile);

		// Initialize time map
		let time = Date.now();
		for (let x = 0; x < width; x++) {
			this.#time_map[x] = [];
			for (let y = 0; y < height; y++) {
				this.#time_map[x][y] = time;
			}
		}

		// Initialize matrix containing all the agents positions (0 -> no agent, 1 -> agent)
		for (let x = 0; x < width; x++) {
			this.#agents_map[x] = [];
			for (let y = 0; y < height; y++) {
				this.#agents_map[x][y] = 0;
			}
		}
	}

	instantiateGameConfig(config) {
		this.#game_config = config;
	}

	getAgentMovementDuration() {
		return this.#game_config.MOVEMENT_DURATION;
	}

	getParcelDecayInterval() {
		if (this.#game_config.PARCEL_DECADING_INTERVAL == "infinite") {
			return Infinity;
		} else {
			return Number(this.#game_config.PARCEL_DECADING_INTERVAL.substring(0, this.#game_config.PARCEL_DECADING_INTERVAL.length - 1));
		}
	}

	getParcelObservationDistance() {
		return this.#game_config.PARCELS_OBSERVATION_DISTANCE;
	}

	getAgentObservationDistance() {
		return this.#game_config.AGENTS_OBSERVATION_DISTANCE;
	}

	getFreeParcels() {
		let freeParcels = [];
		for (const parcel of this.#parcel_memory.values()) {
			if (!parcel.carriedBy) {
				freeParcels.push(parcel);
			}
		}

		return freeParcels;
	}

	getCarriedParcels() {
		return this.#carried_parcels;
	}

	getMePosition() {
		return [this.#me_memory.x, this.#me_memory.y];
	}

	setAgentAt(x, y) {
		this.#agents_map[x][y] = 1;
	}

	clearAgentAt(x, y) {
		this.#agents_map[x][y] = 0;
	}

	isAgentAt(x, y) {
		return this.#agents_map[x][y] == 1;
	}

	/**
	 * Reset the internal map that represent the cells occupied by other agents (to 0, completely free)
	 */
	#resetAgentsMap() {
		// Initialize matrix containing all the agents positions (0 -> no agent, 1 -> agent)
		for (let x = 0; x < this.#game_map.getWidth(); x++) {
			for (let y = 0; y < this.#game_map.getHeight(); y++) {
				this.clearAgentAt(x, y);
			}
		}
	}

	updateMePosition(x, y) {
		this.#me_memory.x = x;
		this.#me_memory.y = y;
	}

	increaseMeMoves() {
		this.#me_memory.moves += 1;
	}

	resetMeMoves() {
		this.#me_memory.moves = 0;
	}

	printRaw() {
		this.#game_map.printRaw();
	}

	onYouUpdate(id, name, x, y, score) {
		this.#me_memory.id = id;
		this.#me_memory.name = name;
		this.#me_memory.x = x;
		this.#me_memory.y = y;
		this.#me_memory.score = score;

		if (Number.isInteger(x) && Number.isInteger(y)) {
			this.#updateTimeMap(Math.round(x), Math.round(y));
		}

		//TODO update pal
		//TODO revise memory
	}

	onAgentSensingUpdate(aa) {
		// Add the sensed agents to the agent belief set
		let now = Date.now();
		aa.forEach((a) => {
			a.time = now;

			// Check if agent already in set
			if (this.#agent_memory.has(a.id)) {
				// If so, remove old position in agent map
				this.clearAgentAt(Math.round(this.#agent_memory.get(a.id).x), Math.round(this.#agent_memory.get(a.id).y));
			}
			// Update agent memory
			this.#agent_memory.set(a.id, a);
			// Update agent map
			this.setAgentAt(Math.round(a.x), Math.round(a.y));

			//TODO controlla se serve
			// If a is my pal
			if (a.id == this.#pal_memory.id) {
				// Update its coordinates in real time

				// TODO vedere se togliere round
				this.#pal_memory.x = Math.round(a.x);
				this.#pal_memory.y = Math.round(a.y);
			}
		});
	}

	onParcelSensingUpdate(pp) {
		// Reset carried parcels
		this.#carried_parcels = new Map();

		// Add the sensed parcels to the parcel belief set
		let now = Date.now();
		for (const p of pp) {
			p.time = now;
			this.#parcel_memory.set(p.id, p);

			// If the parcel is carried by me
			if (p.carriedBy == this.#me_memory.id) {
				// Push it in the carried parcels set
				this.#carried_parcels.set(p.id, p);
			}
		}

		// Remove carried parcels after delivery
		for (const [id, parcel] of this.#parcel_memory) {
			if (parcel.carriedBy == this.#me_memory.id && parcel.time != now) {
				this.#parcel_memory.delete(id);
			}
		}
	}

	amIHere(x, y) {
		return x == Math.round(this.#me_memory.x) && y == Math.round(this.#me_memory.y);
	}

	/**
	 * TODO vedere se considerare il pal
	 * Compute path from initialPos to finalPos using BFS
	 *
	 * @param {[int, int]} initialPos
	 * @param {[int, int]} finalPos
	 * @returns path or undefined if path not available
	 */
	computePathBFS(initialPos, finalPos) {
		let queue = new Queue();
		let explored = new Set();
		let finalPath = undefined;

		let initialNode = this.#game_map.getGraphNode(initialPos[0], initialPos[1]);

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
				// Check if in the final node there is another agent
				if (this.isAgentAt(currentNode.x, currentNode.y)) {
					// If so, there is no valid path
					return null;
				} else {
					// Otherwise (no agent), set the path
					return path;
				}
			}

			// Create a node ID to avoid exploring the node again
			let currentNodeId = currentNode.x + " " + currentNode.y;

			// If the node not has not been visited
			if (!explored.has(currentNodeId)) {
				// Visit it
				explored.add(currentNodeId);

				// If node is occupied, ignore its neighbors
				if (this.isAgentAt(currentNode.x, currentNode.y)) {
					continue;
				}

				// Otherwise, explore its neighbors
				// Up
				if (currentNode.neighU !== undefined && currentNode.neighU !== null) {
					let tmp = path.slice();
					tmp.push("U");
					queue.enqueue({ currentNode: currentNode.neighU, path: tmp });
				}

				// Right
				if (currentNode.neighR !== undefined && currentNode.neighR !== null) {
					let tmp = path.slice();
					tmp.push("R");
					queue.enqueue({ currentNode: currentNode.neighR, path: tmp });
				}

				// Down
				if (currentNode.neighD !== undefined && currentNode.neighD !== null) {
					let tmp = path.slice();
					tmp.push("D");
					queue.enqueue({ currentNode: currentNode.neighD, path: tmp });
				}

				// Left
				if (currentNode.neighL !== undefined && currentNode.neighL !== null) {
					let tmp = path.slice();
					tmp.push("L");
					queue.enqueue({ currentNode: currentNode.neighL, path: tmp });
				}
			}
		}
		return null;
	}

	pathFromMeTo(x, y) {
		return this.computePathBFS([Math.round(this.#me_memory.x), Math.round(this.#me_memory.y)], [x, y]);
	}

	/**
	 * TODO vedere se considerare il pal
	 * Compute the list of reachable spawn zones from the current agent's position
	 * @returns {Array} list of tile items containing at most MAX_EXPLORABLE_SPAWN_CELLS spawn cells
	 */
	#searchSuitableCellsBFS() {
		let queue = new Queue();
		let explored = new Set();
		let suitableSpawn = [];

		let initialNode = this.#game_map.getGraphNode(Math.round(this.#me_memory.x), Math.round(this.#me_memory.y));

		if (initialNode == undefined) {
			return undefined;
		}

		// Add initial node to the queue
		queue.enqueue(initialNode);

		// Cycle until the queue is empty or a valid path has been found
		while (!queue.isEmpty()) {
			if (suitableSpawn.length > this.#game_config.MAX_EXPLORABLE_SPAWN_CELLS) {
				break;
			}
			// Take the item from the queue
			let currentNode = queue.dequeue();

			// Create a node ID to avoid exploring the node again
			let currentNodeId = currentNode.x + " " + currentNode.y;

			// If the node not has not been visited
			if (!explored.has(currentNodeId)) {
				// Visit it
				explored.add(currentNodeId);

				// If node is occupied, ignore it and its neighbors
				if (this.isAgentAt(currentNode.x, currentNode.y)) {
					continue;
				}

				// Otherwise, check node type
				if (currentNode.type == 1) {
					// If spawn node, then add to suitable spawns
					suitableSpawn.push({ type: currentNode.type, x: currentNode.x, y: currentNode.y });
				}

				// Explore its neighbors
				// Up
				if (currentNode.neighU !== undefined && currentNode.neighU !== null) {
					queue.enqueue(currentNode.neighU);
				}

				// Right
				if (currentNode.neighR !== undefined && currentNode.neighR !== null) {
					queue.enqueue(currentNode.neighR);
				}

				// Down
				if (currentNode.neighD !== undefined && currentNode.neighD !== null) {
					queue.enqueue(currentNode.neighD);
				}

				// Left
				if (currentNode.neighL !== undefined && currentNode.neighL !== null) {
					queue.enqueue(currentNode.neighL);
				}
			}
		}

		return suitableSpawn;
	}

	/**
	 * Compute Manhattan distance between two positions
	 * @param {Number} x1 - x of the first position to consider
	 * @param {Number} y1 - y of the first position to consider
	 * @param {Number} x2 - x of the second position to consider
	 * @param {Number} y2 - y of the second position to consider
	 * @returns {BigInt} Manhattan distance between pos1 and pos2
	 */
	#distance(x1, y1, x2, y2) {
		const dx = Math.abs(Math.round(x1) - Math.round(x2));
		const dy = Math.abs(Math.round(y1) - Math.round(y2));
		return dx + dy;
	}

	/**
	 * Randomly select a cell to explore using the "distance" criterion (distant cells are more probable)
	 * @returns {[BigInt, BigInt]} coordinates of random selected cell using the "distance" criterion
	 */
	distanceExplore() {
		let suitableCells = this.#searchSuitableCellsBFS();

		// Compute distances
		let totalDistance = 0;
		let randX = undefined;
		let randY = undefined;

		suitableCells.forEach((element) => {
			element.distance = this.#distance(this.#me_memory.x, this.#me_memory.y, element.x, element.y);
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

	/**
	 * Randomly select a cell to explore using the "timed" criterion (cells explored long ago and near to the agent's current position are more probable)
	 * @returns {[BigInt, BigInt]} coordinates of random selected cell using the "timed" criterion
	 */
	timedExplore() {
		// Explore only spawning zones
		let suitableCells = this.#searchSuitableCellsBFS();

		let tmp = [];
		// Do not consider some specific cells
		for (let i = 0; i < suitableCells.length; i++) {
			// Ignore current agent cell
			if (suitableCells[i].x == Math.round(this.#me_memory.x) && suitableCells[i].y == Math.round(this.#me_memory.y)) {
				continue;
			}

			// Otherwise consider this cell
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
			element.timestamp = now - this.#time_map[element.x][element.y];
			element.distance = this.#distance(this.#me_memory.x, this.#me_memory.y, element.x, element.y);
			totalTime += element.timestamp;
		});

		// Normalize timestamp
		suitableCells.forEach((element) => {
			element.timestamp /= totalTime; // First normalization
			element.timestamp /= element.distance * element.distance * element.distance + 1; // Penalize distant cells
		});

		// Second normalization using modified timestamps
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

		// If timed explore failed
		if (randX == undefined || randY == undefined) {
			// If this happens, select a random cell to explore based on distance
			return distanceExplore();
		}
		return [randX, randY];
	}

	/**
	 * Update the timestamp of the last visit for the visible cells at the agent's current location
	 */
	#updateTimeMap(x, y) {
		let range = this.#game_config.PARCELS_OBSERVATION_DISTANCE;
		let currentNode = this.#game_map.getGraphNode(x, y);
		let time = Date.now();

		this.#recursiveTimeMap(currentNode, time, range);
	}

	/**
	 * PRIVATE FUNCTION, recursively explore the graph to update the time map
	 * @param {GraphNode} node - currently explored node
	 * @param {BigInt} time - current timestamp to set
	 * @param {BigInt} remainingRange - remaining vision range
	 */
	#recursiveTimeMap(node, time, remainingRange) {
		// If node not already explored (same timestamp) and remaining range
		if (this.#time_map[node.x][node.y] != time && remainingRange > 0) {
			// Explore it
			this.#time_map[node.x][node.y] = time;

			// Explore neighbors
			// Explore its neighbors
			// Up
			if (node.neighU != null) {
				this.#recursiveTimeMap(node.neighU, time, remainingRange - 1);
			}

			// Right
			if (node.neighR != null) {
				this.#recursiveTimeMap(node.neighR, time, remainingRange - 1);
			}

			// Down
			if (node.neighD != null) {
				this.#recursiveTimeMap(node.neighD, time, remainingRange - 1);
			}

			// Left
			if (node.neighL != null) {
				this.#recursiveTimeMap(node.neighL, time, remainingRange - 1);
			}
		}
	}

	/*
	 * TODO sistemare
	mergeTimeMaps(new_time) {
		// Cycle all the timestamps in my time map and, if the new_time has a timestamp more recent, update my timestamp
		for (let x = 0; x < new_time.length; x++) {
			for (let y = 0; y < new_time[x].length; y++) {
				if (this.#raw.timeMap[x][y] < new_time[x][y]) {
					this.#raw.timeMap[x][y] = new_time[x][y];
				}
			}
		}
	}
	*/

	/**
	 * Compute the path to the nearest delivery cell from a given position considering also the other agents as blocking elements
	 * @returns {Array} [0]: coordinates [x, y] of the nearest delivery (if non existing -> [null, null]); [1]: array containing path to nearest delivery from [x, y] cell (if non existing -> null)
	 */
	nearestDeliveryFromHere() {
		let queue = new Queue();
		let explored = new Set();

		let initialNode = this.#game_map.getGraphNode(Math.round(this.#me_memory.x), Math.round(this.#me_memory.y));

		if (initialNode == undefined) {
			return undefined;
		}

		// Add initial node to the queue
		queue.enqueue({ currentNode: initialNode, path: [] });

		// Cycle until the queue is empty or a valid path has been found
		while (!queue.isEmpty()) {
			// Take the item from the queue
			let { currentNode, path } = queue.dequeue();

			// If the current position is a delivery zone
			if (currentNode.type == 2) {
				// Check if in the final node there is no other agent
				if (this.isAgentAt(currentNode.x, currentNode.y)) {
					continue;
				} else {
					return [[currentNode.x, currentNode.y], path];
				}
			}

			let currentNodeId = currentNode.x + " " + currentNode.y;

			// If the node not has not been visited
			if (!explored.has(currentNodeId)) {
				// Visit it
				explored.add(currentNodeId);

				// If node is occupied, ignore its neighbors
				if (this.isAgentAt(currentNode.x, currentNode.y)) {
					continue;
				}

				// Explore its neighbors
				// Up
				if (currentNode.neighU !== undefined && currentNode.neighU !== null) {
					let tmp = path.slice();
					tmp.push("U");
					queue.enqueue({ currentNode: currentNode.neighU, path: tmp });
				}

				// Right
				if (currentNode.neighR !== undefined && currentNode.neighR !== null) {
					let tmp = path.slice();
					tmp.push("R");
					queue.enqueue({ currentNode: currentNode.neighR, path: tmp });
				}

				// Down
				if (currentNode.neighD !== undefined && currentNode.neighD !== null) {
					let tmp = path.slice();
					tmp.push("D");
					queue.enqueue({ currentNode: currentNode.neighD, path: tmp });
				}

				// Left
				if (currentNode.neighL !== undefined && currentNode.neighL !== null) {
					let tmp = path.slice();
					tmp.push("L");
					queue.enqueue({ currentNode: currentNode.neighL, path: tmp });
				}
			}
		}

		return [[null, null], null];
	}

	/**
	 * Compute a revision of the agent's memory regarding parcels and agents positions
	 */
	reviseMemory() {
		let tmpParcels2Ignore = new Map();
		let tmpParcels = new Map();
		let tmpAgents = new Map();

		// Revise memory about parcels2Ignore
		this.#parcels_to_ignore.forEach((timestamp, id) => {
			// Check if I ignored the parcel recently
			if (Date.now() - timestamp < MEMORY_REVISION_PARCELS2IGNORE) {
				// If so, keep ignoring it
				tmpParcels2Ignore.set(id, timestamp);
			}
		});
		this.#parcels_to_ignore = tmpParcels2Ignore;

		// Revise memory information about parcels
		this.#parcel_memory.forEach((parcel) => {
			// Check if I see old parcels position
			if (this.#distance(parcel.x, parcel.y, this.#me_memory.x, this.#me_memory.y) < this.#game_config.PARCELS_OBSERVATION_DISTANCE) {
				// Check if I saw the parcel recently (aka. the onParcelsSensing was called by it)
				if (Date.now() - parcel.time < this.#game_config.INVIEW_MEMORY_DIFFERENCE_THRESHOLD) {
					// If so, preserve it
					tmpParcels.set(parcel.id, parcel);
				}
			} else {
				// Check if I saw the parcel (not in our vision range) recently
				if (Date.now() - parcel.time < this.#game_config.OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD) {
					// If so, preserve it
					tmpParcels.set(parcel.id, parcel);
				}
			}
		});
		this.#parcel_memory = tmpParcels;

		// Revise memory information about agents
		this.#agent_memory.forEach((agent) => {
			// Check if I see old agents position
			if (this.#distance(agent.x, agent.y, this.#me_memory.x, this.#me_memory.y) < this.#game_config.AGENTS_OBSERVATION_DISTANCE) {
				// Check if I saw the agent recently (aka. the onAgentSensing was called by it)
				if (Date.now() - agent.time < this.#game_config.INVIEW_MEMORY_DIFFERENCE_THRESHOLD) {
					// If so, preserve it
					tmpAgents.set(agent.id, agent);
				}
			} else {
				// Check if I saw the agent (not in our vision range) recently
				if (Date.now() - agent.time < this.#game_config.OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD) {
					// If so, preserve it
					tmpAgents.set(agent.id, agent);
				}
			}
		});

		this.#agent_memory = tmpAgents;

		// Reset agents map
		this.#resetAgentsMap();

		// Add the agents to the agent map
		this.#agent_memory.forEach((agent) => {
			this.setAgentAt(Math.round(agent.x), Math.round(agent.y));
		});
	}

	/**
	 * TODO:IMPLEMENT
	 */

	parcelReward() {}
}
