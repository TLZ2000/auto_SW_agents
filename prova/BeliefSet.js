import { GameMap } from "./GameMap.js";

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
			this.#agent_memory.set(a.id, a);

			//TODO controlla se serve
			// If a is my pal
			if (a.id == this.#pal_memory.id) {
				// Update its coordinates in real time
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

	/**
	 * TODO:IMPLEMENT
	 */
	computePathBFS(x, y, palNotBlocking) {}
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
