import { GameMap } from "./GameMap.js";
import { Queue } from "./Queue.js";

export class BeliefSet {
	#game_map = null;
	#agent_memory = null;
	#parcel_memory = null;
	#me_memory = null;
	#pal_memory = null;
	#game_config = null;
	#pal_carried_parcels = null;
	#time_map = null; // Timestamp of last visit to the tile
	#agents_map = null;
	#parcels_map = null;
	#emit_action_pending = false;
	#block_option_generation_flag = false;
	#coop_flag = false;
	#parcels_to_ignore = undefined;

	constructor() {
		this.#agent_memory = new Map();
		this.#parcel_memory = new Map();
		this.#me_memory = {
			id: undefined,
			name: undefined,
			x: undefined,
			y: undefined,
			score: undefined,
			moves: 0,
			token: undefined,
		};
		this.#pal_memory = {
			id: undefined,
			name: undefined,
			x: undefined,
			y: undefined,
			score: undefined,
			moves: 0,
			token: undefined,
			currentIntention: undefined,
		};
		this.#pal_carried_parcels = new Map();
		this.#time_map = [];
		this.#agents_map = [];
		this.#parcels_map = [];
		this.#parcels_to_ignore = new Set();
	}

	/**
	 * Set identification agent information
	 * @param {String} myId - my id
	 * @param {String} myToken - my token
	 * @param {String} palId - pal id
	 * @param {String} palToken - pal token
	 */
	setAgentsInfo(myId, myToken, palId, palToken) {
		this.#me_memory.id = myId;
		this.#me_memory.token = myToken;

		this.#pal_memory.id = palId;
		this.#pal_memory.token = palToken;
	}

	getMyToken() {
		return this.#me_memory.token;
	}

	/**
	 * Update the agent coordinates
	 * @param {Number} x - agent current x coordinate
	 * @param {Number} y - agent current y coordinate
	 */
	updateMePosition(x, y) {
		// Update agent coordinates
		this.#me_memory.x = x;
		this.#me_memory.y = y;
	}

	/**
	 * Initialize game_map, time_map, agents_map and parcels_map
	 * @param {Number} width - width of the game map
	 * @param {Number} height - height of the game map
	 * @param {Array<Map>} tile - array containing the type of cells formatted as {x, y, type}
	 */
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

		// Initialize matrix containing all the agents positions (0 -> no agent/parcel, 1 -> agent/parcel)
		for (let x = 0; x < width; x++) {
			this.#agents_map[x] = [];
			this.#parcels_map[x] = [];
			for (let y = 0; y < height; y++) {
				this.#agents_map[x][y] = 0;
				this.#parcels_map[x][y] = 0;
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
		// Convert decade interval to number (in the game config it is a string)
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

	/**
	 * Compute the list of parcels that are carried by nobody and return it
	 * @returns {Array} freeParcels
	 */
	getFreeParcels() {
		let freeParcels = [];

		// Cycle the parcels in my memory
		for (const parcel of this.#parcel_memory.values()) {
			// Check if the parcel is carried by someone
			if (!parcel.carriedBy) {
				// If not, add it to the list
				freeParcels.push(parcel);
			}
		}

		return freeParcels;
	}

	getCarriedParcels() {
		let tmpCarried = new Map();

		// Cycle the parcel memory
		this.#parcel_memory.forEach((parcel) => {
			// Save only the parcels carried by me
			if (parcel.carriedBy == this.#me_memory.id) {
				tmpCarried.set(parcel.id, parcel);
			}
		});

		// Return the map of parcels carried by me
		return tmpCarried;
	}

	getPalCarriedParcels() {
		return this.#pal_carried_parcels;
	}

	ignoreCarriedParcels() {
		// Cycle the parcel memory
		this.#parcel_memory.forEach((parcel) => {
			// Save only the parcels carried by me
			if (parcel.carriedBy == this.#me_memory.id) {
				this.#parcels_to_ignore.add(parcel.id);
			}
		});
	}

	resetCarriedParcels() {
		let tmpParcels = new Map();

		// Cycle the parcel memory
		this.#parcel_memory.forEach((parcel) => {
			// Save only the parcels not carried by me
			if (parcel.carriedBy != this.#me_memory.id) {
				tmpParcels.set(parcel.id, parcel);
			}
		});

		// Overwrite the parcel memory only with the parcels not carried by me
		this.#parcel_memory = tmpParcels;
	}

	getMePosition() {
		return [this.#me_memory.x, this.#me_memory.y];
	}

	getGraphMapNode(x, y) {
		return this.#game_map.getGraphNode(x, y);
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

	setParcelAt(x, y) {
		this.#parcels_map[x][y] = 1;
	}

	clearParcelAt(x, y) {
		this.#parcels_map[x][y] = 0;
	}

	isParcelAt(x, y) {
		return this.#parcels_map[x][y] == 1;
	}

	isParcelHereLong(x, y) {
		let result = false;
		this.#parcel_memory.forEach((parcel) => {
			if (parcel.x == x && parcel.y == y) {
				result = true;
			}
		});
		return result;
	}

	isAgentHereLong(x, y) {
		let result = false;
		this.#agent_memory.forEach((agent) => {
			if (Math.round(agent.x) == x && Math.round(agent.y) == y) {
				result = true;
			}
		});
		return result;
	}

	/**
	 * Check if there are parcels it the tile where I am
	 * @returns {Boolean}
	 */
	amIOnParcelLong() {
		return this.isParcelHereLong(this.#me_memory.x, this.#me_memory.y);
	}

	/**
	 * Check if there are parcels it the tile where I am
	 * @returns {Boolean}
	 */
	amIOnParcel() {
		return this.isParcelAt(Math.round(this.#me_memory.x), Math.round(this.#me_memory.y));
	}

	/**
	 * Check if I am on a delivery tile
	 * @returns {Boolean}
	 */
	amIOnDelivery() {
		// TODO: controllare perche questo funziona a volte (+ parcel pickup)
		if (Number.isInteger(this.#me_memory.x) && Number.isInteger(this.#me_memory.y)) {
			return this.#game_map.getItem(this.#me_memory.x, this.#me_memory.y) == 2;
		}
		return false;
	}

	amIHere(x, y) {
		return x == Math.round(this.#me_memory.x) && y == Math.round(this.#me_memory.y);
	}

	isPalHere(x, y) {
		return x == Math.round(this.#pal_memory.x) && y == Math.round(this.#pal_memory.y);
	}

	isPalHereFloor(x, y) {
		return x == Math.floor(this.#pal_memory.x) && y == Math.floor(this.#pal_memory.y);
	}

	/**
	 * Check if the next cell in which I want to move is free from other agents (both enemy and pal)
	 * @param direction - direction to move
	 * @returns true if next cell is free, false otherwise
	 */
	isNextCellFree(direction) {
		let myX = Math.round(this.#me_memory.x);
		let myY = Math.round(this.#me_memory.y);
		let agentMapResult = false;
		let palCheckResult = false;

		if (direction == "R") {
			agentMapResult = this.isAgentHereLong(myX + 1, myY);
			palCheckResult = this.isPalHere(myX + 1, myY);
		} else if (direction == "L") {
			agentMapResult = this.isAgentHereLong(myX - 1, myY);
			palCheckResult = this.isPalHere(myX - 1, myY);
		} else if (direction == "U") {
			agentMapResult = this.isAgentHereLong(myX, myY + 1);
			palCheckResult = this.isPalHere(myX, myY + 1);
		} else if (direction == "D") {
			agentMapResult = this.isAgentHereLong(myX, myY - 1);
			palCheckResult = this.isPalHere(myX, myY - 1);
		}
		return true;
	}

	/**
	 * Ask permission to perform an emit action, the permission is given only if no other emit is pending
	 * @returns {Boolean} true -> you can proceed with the emit, false -> you cannot proceed with the emit
	 */
	requireEmit() {
		if (!this.#emit_action_pending) {
			this.#emit_action_pending = true;
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Signal the ending of an emit action, allowing others to perform emits
	 */
	releaseEmit() {
		this.#emit_action_pending = false;
	}

	/**
	 * Signal the beginning of a coop action
	 */
	requireCoop() {
		this.#coop_flag = true;
	}

	/**
	 * Signal the ending of a coop action
	 */
	releaseCoop() {
		this.#coop_flag = false;
	}

	isCooperating() {
		return this.#coop_flag;
	}

	/**
	 * @returns {Boolean} true -> I have no option generation running so you can do option generation, false -> I have option generation running so you can't do option generation
	 */
	isOptionGenerationAllowed() {
		return !this.#block_option_generation_flag;
	}

	/**
	 * Signal that an option generation is currently running
	 */
	setOptionGenerationRunning() {
		this.#block_option_generation_flag = true;
	}

	/**
	 * Signal that the option generation is finished
	 */
	setOptionGenerationNotRunning() {
		this.#block_option_generation_flag = false;
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

	/**
	 * Reset the internal map that represent the cells where there are parcels (to 0, completely free)
	 */
	#resetParcelsMap() {
		// Initialize matrix containing all the parcels positions (0 -> no parcels, 1 -> parcels)
		for (let x = 0; x < this.#game_map.getWidth(); x++) {
			for (let y = 0; y < this.#game_map.getHeight(); y++) {
				this.clearParcelAt(x, y);
			}
		}
	}

	increaseMeMoves() {
		this.#me_memory.moves += 1;
	}

	resetMeMoves() {
		this.#me_memory.moves = 0;
	}

	getMeMoves() {
		return this.#me_memory.moves;
	}

	printRaw() {
		this.#game_map.printRaw();
	}

	onYouUpdate(id, name, x, y, score) {
		this.#me_memory.id = id;
		this.#me_memory.name = name;
		this.updateMePosition(x, y);
		this.#me_memory.score = score;

		if (Number.isInteger(x) && Number.isInteger(y)) {
			this.#updateTimeMap(x, y);
		}
	}

	onAgentSensingUpdate(aa) {
		// Add the sensed agents to the agent belief set
		let now = Date.now();
		aa.forEach((a) => {
			a.time = now;

			// Check if agent already in set
			if (this.#agent_memory.has(a.id)) {
				// If so

				// Remove old position in agent map
				let oldAgent = this.#agent_memory.get(a.id);
				this.clearAgentAt(Math.round(oldAgent.x), Math.round(oldAgent.y));
			}
			// Update agent memory
			this.#agent_memory.set(a.id, a);

			// Update agent map
			this.setAgentAt(Math.round(a.x), Math.round(a.y));
		});
	}

	onParcelSensingUpdate(pp) {
		// TODO togliere parcel map
		this.#resetParcelsMap();

		// Add the sensed parcels to the parcel belief set
		let now = Date.now();
		for (const p of pp) {
			// Memorize only the parcels not ignored
			if (!this.#parcels_to_ignore.has(p.id)) {
				p.time = now;
				this.#parcel_memory.set(p.id, p);

				// Update parcel map only with the free parcels
				if (!p.carriedBy) {
					this.setParcelAt(Math.round(p.x), Math.round(p.y));
				}
			}
		}

		// Remove carried parcels after delivery
		for (const [id, parcel] of this.#parcel_memory) {
			if (parcel.carriedBy == this.#me_memory.id && parcel.time != now) {
				this.#parcel_memory.delete(id);
			}
		}
	}

	/**
	 * Compute path from initialPos to finalPos using BFS
	 *
	 * @param {[int, int]} initialPos
	 * @param {[int, int]} finalPos
	 * @param {Boolean} palOk (default = false) - is it fine if the pal is in the final position?
	 * @returns path, undefined (if initialNode is undefined) or null (if path not existing)
	 */
	computePathBFS(initialPos, finalPos, palOk = false) {
		let queue = new Queue();
		let explored = new Set();

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
				if (this.isAgentHereLong(currentNode.x, currentNode.y)) {
					// If it is the pal and it is fine
					if (palOk && this.isPalHere(currentNode.x, currentNode.y)) {
						// Then return the path
						return path;
					}
					// Otherwise there is no valid path
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
				if (this.isAgentHereLong(currentNode.x, currentNode.y)) {
					continue;
				}

				// Otherwise, explore its neighbors
				// Up
				if (currentNode.neighU !== undefined && currentNode.neighU !== null) {
					let tmp = path.slice();
					tmp.push("U");
					if (!explored.has(currentNode.neighU.x + " " + currentNode.neighU.y)) {
						queue.enqueue({ currentNode: currentNode.neighU, path: tmp });
					}
				}

				// Right
				if (currentNode.neighR !== undefined && currentNode.neighR !== null) {
					let tmp = path.slice();
					tmp.push("R");
					if (!explored.has(currentNode.neighR.x + " " + currentNode.neighR.y)) {
						queue.enqueue({ currentNode: currentNode.neighR, path: tmp });
					}
				}

				// Down
				if (currentNode.neighD !== undefined && currentNode.neighD !== null) {
					let tmp = path.slice();
					tmp.push("D");
					if (!explored.has(currentNode.neighD.x + " " + currentNode.neighD.y)) {
						queue.enqueue({ currentNode: currentNode.neighD, path: tmp });
					}
				}

				// Left
				if (currentNode.neighL !== undefined && currentNode.neighL !== null) {
					let tmp = path.slice();
					tmp.push("L");
					if (!explored.has(currentNode.neighL.x + " " + currentNode.neighL.y)) {
						queue.enqueue({ currentNode: currentNode.neighL, path: tmp });
					}
				}
			}
		}
		return null;
	}

	pathFromMeTo(x, y) {
		return this.computePathBFS([Math.round(this.#me_memory.x), Math.round(this.#me_memory.y)], [x, y]);
	}

	pathFromMeToPal() {
		return this.computePathBFS([Math.round(this.#me_memory.x), Math.round(this.#me_memory.y)], [Math.round(this.#pal_memory.x), Math.round(this.#pal_memory.y)], true);
	}

	/**
	 * Compute the list of reachable spawn zones from the current agent's position
	 * @returns {Array} list of tile items containing at most MAX_EXPLORABLE_SPAWN_CELLS spawn cells
	 */
	#searchSuitableCellsBFS() {
		let queue = new Queue();
		let explored = new Set();
		let suitableSpawn = [];

		let initialNode = this.#game_map.getGraphNode(Math.round(this.#me_memory.x), Math.round(this.#me_memory.y));

		// Check if the initial node is undefined
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
				if (this.isAgentHereLong(currentNode.x, currentNode.y)) {
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
	 * @returns {[BigInt, BigInt]} coordinates of random selected cell using the "distance" criterion, or [undefined, undefined] if error or no suitable cells exists
	 */
	distanceExplore() {
		let suitableCells = this.#searchSuitableCellsBFS();

		if (suitableCells == [] || suitableCells == undefined) {
			return [undefined, undefined];
		}

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
	 * @returns {[BigInt, BigInt]} coordinates of random selected cell using the "timed" criterion, or [undefined, undefined] if error or no suitable cells exists
	 */
	timedExplore() {
		// Explore only spawning zones
		let suitableCells = this.#searchSuitableCellsBFS();

		if (suitableCells == [] || suitableCells == undefined) {
			return [undefined, undefined];
		}

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

		let maxAge = 0;
		// Compute the last time a tile was visited
		suitableCells.forEach((element) => {
			// Compute cell age (time we do not see the cell)
			element.age = now - this.#time_map[element.x][element.y];
			if (element.age > maxAge) {
				maxAge = element.age;
			}

			// Compute normalized distance
			element.distance = Math.log(this.#distance(this.#me_memory.x, this.#me_memory.y, element.x, element.y) + 1);
		});

		let normalizationTerm = 0;
		// Compute cells probabilities
		suitableCells.forEach((element) => {
			// Normalize cell age
			element.age = element.age / maxAge;

			// Compute cell priority
			element.priority = this.#game_config.TIMED_EXPLORE_ALPHA * element.age - this.#game_config.TIMED_EXPLORE_BETA * element.distance;

			normalizationTerm = normalizationTerm + Math.exp(element.priority);
		});

		suitableCells.forEach((element) => {
			// Normalize priority
			element.priority = Math.exp(element.priority) / normalizationTerm;
		});

		let randomValue = Math.random();

		// Recover selected element
		suitableCells.forEach((element) => {
			// If we haven't selected a suitable cell
			if (!randX) {
				// Try to find one with a probability proportional to its its timestamp (the bigger the time the more probable)
				randomValue -= element.priority;
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
			return this.distanceExplore();
		}
		return [randX, randY];
	}

	/**
	 * Update the timestamp of the last visit for the visible cells at the agent's current location
	 */
	#updateTimeMap(x, y) {
		let range = this.#game_config.PARCELS_OBSERVATION_DISTANCE;
		let time = Date.now();

		this.#recursiveTimeMap(x, y, time, range);
	}

	/**
	 * Recursively explore the graph to update the time map
	 * @param {Number} x - current x position
	 * @param {Number} y - current y position
	 * @param {BigInt} time - current timestamp to set
	 * @param {BigInt} remainingRange - remaining vision range
	 */
	#recursiveTimeMap(x, y, time, remainingRange) {
		// If node not already explored (same timestamp) and remaining range
		if (this.#time_map[x][y] != time && remainingRange > 0) {
			// Explore it
			this.#time_map[x][y] = time;

			// Explore its neighbors
			// Up
			if (y + 1 < this.#game_map.getHeight()) {
				this.#recursiveTimeMap(x, y + 1, time, remainingRange - 1);
			}

			// Right
			if (x + 1 < this.#game_map.getWidth()) {
				this.#recursiveTimeMap(x + 1, y, time, remainingRange - 1);
			}

			// Down
			if (y - 1 >= 0) {
				this.#recursiveTimeMap(x, y - 1, time, remainingRange - 1);
			}

			// Left
			if (x - 1 >= 0) {
				this.#recursiveTimeMap(x - 1, y, time, remainingRange - 1);
			}
		}
	}

	/**
	 * Compute the path to the nearest delivery cell from a given position considering the other agents as blocking elements
	 * @returns {Array} [0]: coordinates [x, y] of the nearest delivery (if non existing -> [null, null], if initial node undefined -> [undefined, undefined]); [1]: array containing path to nearest delivery from [x, y] cell (if non existing -> null, if initial node undefined -> undefined)
	 */
	nearestDeliveryFromPos(x, y) {
		let queue = new Queue();
		let explored = new Set();

		let initialNode = this.#game_map.getGraphNode(x, y);

		if (initialNode == undefined) {
			return [[undefined, undefined], undefined];
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
				if (this.isAgentHereLong(currentNode.x, currentNode.y)) {
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
				if (this.isAgentHereLong(currentNode.x, currentNode.y)) {
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
	 * Compute the path to the nearest delivery cell from the agent (me) position considering the other agents as blocking elements
	 * @returns {Array} [0]: coordinates [x, y] of the nearest delivery (if non existing -> [null, null], if initial node undefined -> [undefined, undefined]); [1]: array containing path to nearest delivery from [x, y] cell (if non existing -> null, if initial node undefined -> undefined)
	 */
	nearestDeliveryFromHere() {
		return this.nearestDeliveryFromPos(Math.round(this.#me_memory.x), Math.round(this.#me_memory.y));
	}

	/**
	 * Compute a revision of the agent's memory regarding parcels and agents positions
	 */
	reviseMemory() {
		let tmpParcels = new Map();
		let tmpAgents = new Map();

		// Revise memory information about parcels
		this.#parcel_memory.forEach((parcel) => {
			// Check if I see old parcels position
			if (this.#distance(parcel.x, parcel.y, this.#me_memory.x, this.#me_memory.y) < this.#game_config.PARCELS_OBSERVATION_DISTANCE) {
				// Check if I saw the parcel recently (aka. the onParcelsSensing was called by it)
				if (Date.now() - parcel.time < this.getParcelDecayInterval() + 100) {
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
				if (Date.now() - agent.time < this.#game_config.OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD || agent.id == this.#pal_memory.id) {
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

		// Reset parcels map
		this.#resetParcelsMap();

		// Add the parcels to the parcel map TODO TOGLIERE
		/*this.#parcel_memory.forEach((parcel) => {
			this.setParcelAt(Math.round(parcel.x), Math.round(parcel.y));
		});*/
	}

	/**
	 * Compute the new score of a parcel after a specific time considering the specific map configuration and the last time the parcel was seen
	 * @param {BigInt} time - time in milliseconds
	 * @param {BigInt} parcelScore - current parcel score
	 * @param {BigInt} lastVisitTime - timestamp of the parcel's last visit
	 * @returns  the estimated score of the parcel after the provided time
	 */
	#parcelScoreAfterMs(time, parcelScore, lastVisitTime) {
		let decadeInterval = this.getParcelDecayInterval(); //Seconds

		// Convert to ms
		decadeInterval *= 1000;

		// Add some additional time margin
		let marginedTime = time + this.getAgentMovementDuration();
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

	/**
	 * Compute the new score of a parcel after a specific path considering the specific map configuration and the last time the parcel was seen
	 * @param {Array} path - movement path
	 * @param {BigInt} parcelScore - current parcel score
	 * @param {BigInt} lastVisitTime - timestamp of the parcel's last visit
	 * @returns {BigInt} the estimated score of the parcel after the provided path has been completed by the agent
	 */
	#parcelScoreAfterMsPath(path, parcelScore, lastVisitTime) {
		return this.#parcelScoreAfterMs(path.length * this.getAgentMovementDuration(), parcelScore, lastVisitTime);
	}

	/**
	 * Compute the expected reward of delivering the currently carried parcels following a specific path
	 * @param {Array} path - path the agent will follow to deliver the parcels
	 * @param {Map} carriedParcels - parcels carried by the agent
	 * @returns expected reward of delivering the currently carried following the provided path
	 */
	expectedRewardOfCarriedParcels(path, carriedParcels) {
		let totalScore = 0;

		if (path == undefined || path == null) {
			return 0;
		}

		carriedParcels.forEach((parcel) => {
			totalScore += this.#parcelScoreAfterMsPath(path, parcel.reward, Date.now());
		});
		return totalScore;
	}

	/**
	 * Compute the expected reward of a specific parcel (go pick up and deliver)
	 * @param {{x:BigInt, y: BigInt, reward: BigInt, time:BigInt}} parcel
	 * @param {Number} x - coordinate x of the agent
	 * @param {Number} y - coordinate y of the agent
	 * @returns Map containing the path from the current agent position to the parcel (pathToParcel == undefined if initialNode undefined, == null if path not existing), the path from the parcel to nearest delivery zone (pathToDeliver, undefined if not reachable) and expected reward (expectedReward)
	 */
	#parcelCostReward(parcel, x, y) {
		let parX = parcel.x;
		let parY = parcel.y;
		let parScore = parcel.reward;
		let lastVisitTime = parcel.time;

		// Compute distance agent -> parcel
		let pathToParcel = this.computePathBFS([Math.round(x), Math.round(y)], [parX, parY]);

		// Find path to the nearest delivery
		let pathToDeliver = this.nearestDeliveryFromPos(parX, parY)[1];

		if (pathToParcel == undefined || pathToParcel == null || pathToDeliver == undefined || pathToDeliver == null) {
			return {
				pathToParcel: pathToParcel,
				pathToDeliver: pathToDeliver,
				expectedReward: 0,
			};
		}

		// Compute expected reward for [parX, parY] parcel
		let expectedReward = this.#parcelScoreAfterMsPath(pathToParcel.concat(pathToDeliver), parScore, lastVisitTime);

		// Increase the reward based on distance from parcel
		if (pathToParcel.length <= this.#game_config.PARCEL_DISTANCE_LOW) {
			expectedReward = expectedReward * this.#game_config.PARCEL_WEIGHT_LOW;
		} else if (pathToParcel.length <= this.#game_config.PARCEL_DISTANCE_MID) {
			expectedReward = expectedReward * this.#game_config.PARCEL_WEIGHT_MID;
		} else if (pathToParcel.length <= this.#game_config.PARCEL_DISTANCE_HIGH) {
			expectedReward = expectedReward * this.#game_config.PARCEL_WEIGHT_HIGH;
		}

		// Return paths a->p, p->d, expected reward
		return {
			pathToParcel: pathToParcel,
			pathToDeliver: pathToDeliver,
			expectedReward: expectedReward,
		};
	}

	/**
	 * Compute the expected reward of delivering the currently carried parcels plus a targeted parcel to pick up
	 * @param {{x:BigInt, y: BigInt, reward: BigInt, time:BigInt}} parcel2Pickup - targeted parcel to pick up
	 * @param {Number} x - coordinate x of the agent
	 * @param {Number} y - coordinate y of the agent
	 * @param {Map} carriedParcels - parcels carried by the agent
	 * @param {Boolean} ignoreCarriedParcels - if true ignores the reward from carried parcels
	 * @returns list containing 0: expected reward of delivering the currently carried parcels and the targeted parcel to pick up, 1: length of path to pickup the parcel
	 */
	#expectedRewardCarriedAndPickup(parcel2Pickup, x, y, carriedParcels, ignoreCarriedParcels) {
		let pickUpReward = this.#parcelCostReward(parcel2Pickup, x, y);

		// If we can reach the parcel to pickup (pathToDeliver and pathToParcel != undefined and != null) with a reward > 0
		if (pickUpReward.expectedReward != 0 && pickUpReward.pathToDeliver != undefined && pickUpReward.pathToDeliver != null && pickUpReward.pathToParcel != undefined && pickUpReward.pathToParcel != null) {
			// Compute expected reward for the carried parcels (if not ignored)
			let totalScore;
			if (ignoreCarriedParcels) {
				totalScore = pickUpReward.expectedReward;
			} else {
				totalScore = pickUpReward.expectedReward + this.expectedRewardOfCarriedParcels(pickUpReward.pathToParcel.concat(pickUpReward.pathToDeliver), carriedParcels);
			}

			// Return the final expected score
			return [totalScore, pickUpReward.pathToParcel.length];
		} else {
			// Otherwise, no reward
			if (pickUpReward.pathToParcel) {
				return [0, pickUpReward.pathToParcel.length];
			} else {
				return [0, Infinity];
			}
		}
	}

	expectedRewardCarriedAndPickupMe(parcel2Pickup, ignoreCarriedParcels = false) {
		return this.#expectedRewardCarriedAndPickup(parcel2Pickup, Math.round(this.#me_memory.x), Math.round(this.#me_memory.y), this.getCarriedParcels(), ignoreCarriedParcels);
	}

	expectedRewardCarriedAndPickupPal(parcel2Pickup, ignoreCarriedParcels = false) {
		// Check if pal exists
		if (this.#pal_memory.x && this.#pal_memory.y) {
			// If so, return the reward
			return this.#expectedRewardCarriedAndPickup(parcel2Pickup, Math.round(this.#pal_memory.x), Math.round(this.#pal_memory.y), this.getPalCarriedParcels(), ignoreCarriedParcels);
		}

		// Otherwise, no reward
		return [0, Infinity];
	}

	getPalId() {
		return this.#pal_memory.id;
	}

	getPalCurrentIntention() {
		return this.#pal_memory.currentIntention;
	}

	#mapToJSON(map) {
		return JSON.stringify(Object.fromEntries(map));
	}

	#JSONToMap(json) {
		return new Map(Object.entries(JSON.parse(json)));
	}

	/**
	 * Return content of message to send to pal with my current position
	 */
	messageContent_positionUpdate() {
		return JSON.stringify({ x: this.#me_memory.x, y: this.#me_memory.y });
	}

	/**
	 * // Return content of message to send to pal with the parcels, the agents and the carried parcels in the current belief set
	 */
	messageContent_memoryShare() {
		return JSON.stringify({ parcels: this.#mapToJSON(this.#parcel_memory), agents: this.#mapToJSON(this.#agent_memory), carriedParcels: this.#mapToJSON(this.getCarriedParcels()) });
	}

	messageHandler_positionUpdate(message) {
		// Recover message content
		let palX = JSON.parse(message).x;
		let palY = JSON.parse(message).y;

		// TODO rimuovere agentMap dappertutto
		// If the pal has an old position
		if (this.#pal_memory.x) {
			// Clear it
			this.clearAgentAt(Math.round(this.#pal_memory.x), Math.round(this.#pal_memory.y));
		}

		// Update pal position
		this.#pal_memory.x = palX;
		this.#pal_memory.y = palY;

		// Update new pal position
		this.setAgentAt(Math.round(this.#pal_memory.x), Math.round(this.#pal_memory.y));

		let agent = { id: this.#pal_memory.id, x: this.#pal_memory.x, y: this.#pal_memory.y, time: Date.now() };
		this.#agent_memory.set(agent.id, agent);

		// Update time map based on pal position
		if (Number.isInteger(palX) && Number.isInteger(palY)) {
			this.#updateTimeMap(palX, palY);
		}
	}

	messageHandler_memoryShare(message) {
		// Recover message content
		let msg = JSON.parse(message);
		let parcels = this.#JSONToMap(msg.parcels);
		let agents = this.#JSONToMap(msg.agents);

		this.#pal_carried_parcels = this.#JSONToMap(msg.carriedParcels);

		// Cycle all the reconstructed parcels
		parcels.forEach((p) => {
			// Consider only parcels not ignored
			if (!this.#parcels_to_ignore.has(p.id)) {
				// Check if the parcel is already in my memory
				if (this.#parcel_memory.has(p.id)) {
					// If so, check if the received parcel information is newer than the parcel information in my memory
					if (this.#parcel_memory.get(p.id).time < p.time) {
						// If so, update my memory
						this.#parcel_memory.set(p.id, p);
					}
				} else {
					// If not in memory, add it
					this.#parcel_memory.set(p.id, p);
				}
			}
		});

		// Cycle all the reconstructed agents
		agents.forEach((a) => {
			// Check if the agent is already in my memory
			if (this.#agent_memory.has(a.id)) {
				// If so, check if the received agent information is newer than the agent information in my memory
				if (this.#agent_memory.get(a.id).time < a.time) {
					// Remove old position in agent map
					let oldAgent = this.#agent_memory.get(a.id);
					this.clearAgentAt(Math.round(oldAgent.x), Math.round(oldAgent.y));

					// If so, update my memory
					this.#agent_memory.set(a.id, a);

					// Update agent map
					this.setAgentAt(Math.round(a.x), Math.round(a.y));
				}
			} else {
				// If not in memory, add it if that agent is no me
				if (this.#me_memory.id != a.id) {
					this.#agent_memory.set(a.id, a);

					// Update agent map
					this.setAgentAt(Math.round(a.x), Math.round(a.y));
				}
			}
		});
	}

	messageHandler_currentIntention(message) {
		// Save pal current intention
		this.#pal_memory.currentIntention = message;
	}

	messageHandler_shareRequest(message) {
		// Recover message content
		let palX = JSON.parse(message).x;
		let palY = JSON.parse(message).y;

		// Update pal position
		this.#pal_memory.x = palX;
		this.#pal_memory.y = palY;

		// Compute middle point between me and pal
		let path = this.pathFromMeToPal();
		if (path == null) {
			return { outcome: "false" };
		} else if (path.length >= 4) {
			// We have at least 4 positions, so I can easily define my position, pal position and support position
			let tmpMeX = Math.round(this.#me_memory.x);
			let tmpMeY = Math.round(this.#me_memory.y);
			let length = Math.round(path.length / 2);

			for (let i = 0; i < length; i++) {
				if (path[i] == "U") {
					tmpMeY++;
				} else if (path[i] == "D") {
					tmpMeY--;
				} else if (path[i] == "R") {
					tmpMeX++;
				} else if (path[i] == "L") {
					tmpMeX--;
				}
			}

			let tmpPalX = tmpMeX;
			let tmpPalY = tmpMeY;
			if (path[length + 1] == "U") {
				tmpPalY++;
			} else if (path[length + 1] == "D") {
				tmpPalY--;
			} else if (path[length + 1] == "R") {
				tmpPalX++;
			} else if (path[length + 1] == "L") {
				tmpPalX--;
			}

			let tmpPalSupX = tmpPalX;
			let tmpPalSupY = tmpPalY;
			if (path[length + 2] == "U") {
				tmpPalSupY++;
			} else if (path[length + 2] == "D") {
				tmpPalSupY--;
			} else if (path[length + 2] == "R") {
				tmpPalSupX++;
			} else if (path[length + 2] == "L") {
				tmpPalSupX--;
			}
			return { outcome: "true", mePosX: tmpMeX, mePosY: tmpMeY, yourPosX: tmpPalX, yourPosY: tmpPalY, yourSupportPosX: tmpPalSupX, yourSupportPosY: tmpPalSupY };
		} else {
			// I don't have enough space between me and the pal to define the 3 positions I need
			let missingCells = 4 - path.length; // How many free spaces I need

			// Define a path to the nearest delivery
			let tmpPath = this.nearestDeliveryFromHere()[1];
			if (tmpPath != null && tmpPath.length >= missingCells) {
				// Use that path to move away and gain at least 4 free spaces
				return { outcome: "me_move", path: tmpPath, missingCells: missingCells };
			}
		}
	}
}
