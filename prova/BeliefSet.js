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
	}

	instantiateGameMap(width, height, tile) {
		this.#game_map = new GameMap(width, height, tile);
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
			return Number(decadeInterval.substring(0, decadeInterval.length - 1));
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

	printRaw() {
		this.#game_map.printRaw();
	}

	onYouUpdate(id, name, x, y, score) {
		this.#me_memory.id = id;
		this.#me_memory.name = name;
		this.#me_memory.x = x;
		this.#me_memory.y = y;
		this.#me_memory.score = score;

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
				this.#game_map.clearAgentAt(Math.round(this.#agent_memory.get(a.id).x), Math.round(this.#agent_memory.get(a.id).y));
			}
			// Update agent memory
			this.#agent_memory.set(a.id, a);
			// Update agent map
			this.#game_map.setAgentAt(Math.round(a.x), Math.round(a.y));

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
		// Add the sensed parcels to the parcel belief set
		let now = Date.now();
		for (const p of pp) {
			p.time = now;
			this.#parcel_memory.set(p.id, p);
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
				if (this.#game_map.isAgentAt(currentNode.x, currentNode.y)) {
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
				if (this.#game_map.isAgentAt(currentNode.x, currentNode.y)) {
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

	/**
	 * TODO:IMPLEMENT
	 */
	searchSuitableCellsBFS() {}
	distanceExplore() {}
	timedExplore() {}
	parcelReward() {}
	carryingParcels() {}
	reviseMemory() {}
	nearestDeliveryFromHere() {}

	// TODO se serve
	nearestDeliveryFromHereCoords() {}
	nearestDeliveryFromHerePath() {}
}
