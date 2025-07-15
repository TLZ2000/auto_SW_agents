import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { onlineSolver } from "@unitn-asa/pddl-client";
import { BeliefSet } from "./BeliefSet.js";
import { IntentionRevisionReplace, Plan } from "./Intentions.js";
import fs from "fs";

// TODO: spostare in belief
const AGENT_ID = "e12f73";
const AGENT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImUxMmY3MyIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnMiLCJ0ZWFtSWQiOiJlMzcwNmYiLCJ0ZWFtTmFtZSI6IlRoZSBSb2JvU2FwaWVucyIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzUyNDgxNTE2fQ.04NGjhhl648OjThrneW1JgrK7kNHI3-ioGUdlhIXBiU";
const SERVER_ADDRS = "http://localhost:8080";
// const SERVER_ADDRS = "https://deliveroojs.rtibdi.disi.unitn.it";
//const SERVER_ADDRS = "https://deliveroojs25.azurewebsites.net";

const MAX_EXPLORABLE_SPAWN_CELLS = 100;
const INVIEW_MEMORY_DIFFERENCE_THRESHOLD = 2000; // Threshold for parcels and agent in our vision range
const OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD = 10000; // Threshold for parcels and agent not in our vision range

const PARCEL_DISTANCE_LOW = 1;
const PARCEL_DISTANCE_MID = 2;
const PARCEL_DISTANCE_HIGH = 3;
const PARCEL_WEIGHT_LOW = 10;
const PARCEL_WEIGHT_MID = 5;
const PARCEL_WEIGHT_HIGH = 2.5;

const MOVES_SCALE_FACTOR = 30; // Lower values mean I want to deliver more often
const MOVES_SCALE_FACTOR_NO_DECAY = 5; // Lower values mean I want to deliver more often

const TIMED_EXPLORE = 0.99;

let block_option_generation_flag = false;
let block_option_generation_planning_flag = false;

//--------------------------------------------------------------------------------------------------------------

/**
 * Plan class handling the "explore" intention
 */
class Explore extends Plan {
	static isApplicableTo(explore) {
		return explore == "explore";
	}

	async execute(explore, type) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		let coords;

		if (type == "timed") {
			coords = belief.timedExplore();
		} else if (type == "distance") {
			coords = belief.distanceExplore();
		}

		// When a valid cell has been found, move to it (and hope to find something interesting)
		await this.subIntention(["go_to", coords[0], coords[1]], myAgent.getPlanLibrary());
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

/**
 * Plan class handling the "go_to" intention
 */
class BFSmove extends Plan {
	static isApplicableTo(go_to, x, y) {
		return go_to == "go_to";
	}

	async execute(go_to, x, y) {
		// Get path
		let path = belief.pathFromMeTo(x, y);

		// If no path applicable, fail the intention
		if (path == undefined || path == null) {
			this.stop();
			throw ["stopped"];
		}

		// Otherwise, follow the path
		let i = 0;
		while (i < path.length) {
			// If stopped then quit
			if (this.stopped) throw ["stopped"];

			let moved_horizontally = undefined;
			let moved_vertically = undefined;

			if (path[i] == "R") {
				moved_horizontally = await client.emitMove("right");
			} else if (path[i] == "L") {
				moved_horizontally = await client.emitMove("left");
			}

			// Check if agent is carrying parcels
			let carriedParcels = belief.getCarriedParcels();

			// If moved horizontally
			if (moved_horizontally) {
				belief.updateMePosition(moved_horizontally.x, moved_horizontally.y);

				// And if agent is carrying parcels
				if (carriedParcels.size > 0) {
					// Increment the movement penalty (increase probability to go deliver)
					belief.increaseMeMoves();
				}
			}

			if (this.stopped) throw ["stopped"]; // if stopped then quit

			if (path[i] == "U") {
				moved_vertically = await client.emitMove("up");
			} else if (path[i] == "D") {
				moved_vertically = await client.emitMove("down");
			}

			// If moved vertically
			if (moved_vertically) {
				belief.updateMePosition(moved_vertically.x, moved_vertically.y);

				// And if agent is carrying parcels
				if (carriedParcels.size > 0) {
					// Increment the movement penalty (increase probability to go deliver)
					belief.increaseMeMoves();
				}
			}

			// If stucked, stop the action
			if (!moved_horizontally && !moved_vertically) {
				// TODO capire perché entra qua anche se si muove
				console.log("go_to stopped due to stucked");
				this.stop();
				throw ["stopped"];
			}

			i++;
		}
		return true;
	}
}

/**
 * Plan class handling the "go_to" intention
 */
class FollowPath extends Plan {
	static isApplicableTo(follow_path, x, y) {
		return follow_path == "follow_path";
	}

	async execute(follow_path, path) {
		// If no path applicable, fail the intention
		if (path == undefined || path == null) {
			this.stop();
			throw ["stopped"];
		}

		// Otherwise, follow the path
		let i = 0;
		while (i < path.length) {
			// If stopped then quit
			if (this.stopped) throw ["stopped"];

			let moved_horizontally = undefined;
			let moved_vertically = undefined;

			if (path[i] == "R") {
				moved_horizontally = await client.emitMove("right");
			} else if (path[i] == "L") {
				moved_horizontally = await client.emitMove("left");
			}

			// Check if agent is carrying parcels
			let carriedParcels = belief.getCarriedParcels();

			// If moved horizontally
			if (moved_horizontally) {
				belief.updateMePosition(moved_horizontally.x, moved_horizontally.y);

				// And if agent is carrying parcels
				if (carriedParcels.size > 0) {
					// Increment the movement penalty (increase probability to go deliver)
					belief.increaseMeMoves();
				}
			}

			if (this.stopped) throw ["stopped"]; // if stopped then quit

			if (path[i] == "U") {
				moved_vertically = await client.emitMove("up");
			} else if (path[i] == "D") {
				moved_vertically = await client.emitMove("down");
			}

			// If moved vertically
			if (moved_vertically) {
				belief.updateMePosition(moved_vertically.x, moved_vertically.y);

				// And if agent is carrying parcels
				if (carriedParcels.size > 0) {
					// Increment the movement penalty (increase probability to go deliver)
					belief.increaseMeMoves();
				}
			}

			// If stucked, stop the action
			if (!moved_horizontally && !moved_vertically) {
				// TODO capire perché entra qua anche se si muove
				console.log("go_to stopped due to stucked");
				this.stop();
				throw ["stopped"];
			}

			i++;
		}
		return true;
	}
}

/**
 * Plan class handling the "go_pick_up" intention
 */
class GoPickUp extends Plan {
	static isApplicableTo(go_pick_up, x, y, id) {
		return go_pick_up == "go_pick_up" /*|| go_pick_up == "emergency_go_pick_up"*/;
	}

	async execute(go_pick_up, x, y) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await this.subIntention(["go_to", x, y], myAgent.getPlanLibrary());
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await client.emitPickup();
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

/**
 * Plan class handling the "go_deliver" intention
 */

class GoDeliver extends Plan {
	static isApplicableTo(go_deliver) {
		return go_deliver == "go_deliver";
	}

	async execute(go_deliver, reward, path) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit

		await this.subIntention(["follow_path", path], myAgent.getPlanLibrary());
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await client.emitPutdown();
		belief.resetMeMoves();
		belief.resetCarriedParcels();
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

/**
 * Plan class handling the "go_to" intention
 */
class PDDLmove extends Plan {
	static isApplicableTo(go_to, x, y) {
		return go_to == "go_to";
	}

	async execute(go_to, x, y) {
		// TODO capire perché planning non funziona

		// Define problem
		let pddlProblem = belief.getPDDLProblemString(x, y);

		// Define domain
		let pddlDomain = await readFile("./deliveroo_domain.pddl");

		// Get the plan
		block_option_generation_planning_flag = true;
		let plan = await onlineSolver(pddlDomain, pddlProblem);
		block_option_generation_planning_flag = false;

		if (plan == undefined) {
			console.log("Plan undefined, stop intention");
			this.stop();
			throw ["stopped"];
		}

		let path = [];

		// If a plan exists
		if (plan != undefined) {
			// Cycle the plan and convert it to a path
			for (let i = 0; i < plan.length; i++) {
				switch (plan[i].action) {
					case "RIGHT":
						path.push("R");
						break;
					case "LEFT":
						path.push("L");
						break;
					case "UP":
						path.push("U");
						break;
					case "DOWN":
						path.push("D");
						break;
				}
			}
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

			// Check if agent is carrying parcels
			let carriedParcels = belief.getCarriedParcels();

			// If moved horizontally
			if (moved_horizontally) {
				belief.updateMePosition(moved_horizontally.x, moved_horizontally.y);

				if (carriedParcels.size > 0) {
					belief.increaseMeMoves();
				}
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
				belief.updateMePosition(moved_vertically.x, moved_vertically.y);

				if (carriedParcels.size > 0) {
					belief.increaseMeMoves();
				}
			}

			// If stucked
			if (!moved_horizontally && !moved_vertically) {
				// TODO capire perché entra qua anche se si muove
				console.log("go_to stopped due to stucked");
				this.stop();
				throw ["stopped"];
			}

			i++;
		}
		return true;
	}
}

/**
 * Read txt file content
 * @param {String} path - path of file
 * @returns content of txt file as string
 */
function readFile(path) {
	return new Promise((res, rej) => {
		fs.readFile(path, "utf8", (err, data) => {
			if (err) rej(err);
			else res(data);
		});
	});
}

function getBestPickupOption() {
	const options = [];

	// Cycle all free parcels in belief
	belief.getFreeParcels().forEach((parcel) => {
		// If the parcel is in my position
		if (belief.amIHere(parcel.x, parcel.y)) {
			// Then, I must pick it up
			options.push([
				"go_pick_up",
				parcel.x, // X coord
				parcel.y, // Y coord
				parcel.id, // ID
				Infinity, // Expected reward
				[], // Path to pickup parcel
			]);
		} else {
			/*
				// TODO vedere come aggiungere
				// Otherwise, compute and save the current expected reward for this parcel from the current agent's position
				let tmpReward = [];
				if (me.parcels2Ignore.has(parcel.id)) {
					tmpReward = [0, Infinity];
				} else {
					tmpReward = expectedRewardCarriedAndPickup(carriedParcels, parcel);
				}*/

			let tmpReward = belief.expectedRewardCarriedAndPickup(parcel);

			options.push([
				"go_pick_up",
				parcel.x, // X coord
				parcel.y, // Y coord
				parcel.id, // ID
				tmpReward[0], // Expected reward
				tmpReward[1], // length of the path to pickup the parcel
			]);
		}
	});

	// Options filtering
	let bestOption = undefined;
	let maxExpectedScore = 0;
	let minDistance = 0;

	// Select best pickup option
	options.forEach((option) => {
		let currentExpectedScore = 0;
		let currentDistance = 0;
		// TODO in teoria si può togliere il controllo, options contiene solo go_pick_up
		if (option[0] == "go_pick_up") {
			currentExpectedScore = option[4];
			currentDistance = option[5];
		}

		// Check the best expected score
		if (currentExpectedScore > maxExpectedScore) {
			maxExpectedScore = currentExpectedScore;
			minDistance = currentDistance;
			bestOption = option;
		} else if (currentExpectedScore == maxExpectedScore) {
			// If same expected score, then select the nearest parcel
			if (currentDistance < minDistance) {
				minDistance = currentDistance;
				bestOption = option;
			}
		}
	});

	return bestOption;
}

function getDeliveryOption() {
	// Define a delivery option
	let deliveryOption = undefined;

	// Check if we are carrying parcels, so it makes sense to deliver them
	if (belief.getCarriedParcels().size > 0) {
		// Get the path to the nearest delivery
		let pathNearestDelivery = belief.nearestDeliveryFromHere()[1];

		// Check if we are in a delivery cell
		if (belief.getGraphMapNode(Math.round(belief.getMePosition()[0]), Math.round(belief.getMePosition()[1])).type == 2) {
			// If so, deliver
			deliveryOption = ["go_deliver", Infinity, pathNearestDelivery];
		} else {
			if (belief.getParcelDecayInterval() == Infinity) {
				// If there is no parcel decay, then increase the expected reward of the carried parcels using a dedicated scale factor
				deliveryOption = ["go_deliver", belief.expectedRewardOfCarriedParcels(pathNearestDelivery) * (belief.getMeMoves() / MOVES_SCALE_FACTOR_NO_DECAY + 1), pathNearestDelivery];
			} else {
				// If there is parcel decay, let the user weight the parcel reward increase
				deliveryOption = ["go_deliver", belief.expectedRewardOfCarriedParcels(pathNearestDelivery) * (belief.getMeMoves() / MOVES_SCALE_FACTOR + 1), pathNearestDelivery];
			}
		}
	}

	// Re-check if I still am carrying parcels, just to be sure
	if (belief.getCarriedParcels().size > 0) {
		// If so, return the delivery option
		return deliveryOption;
	}
	// Otherwise, it means that I already delivered the parcels, so there is no point in returning a delivery option
	return undefined;
}

function getBestOption() {
	let bestPickupOption = getBestPickupOption();

	let deliveryOption = getDeliveryOption();

	// Select the deliver option or pickup option (aka. best_option) based on the highest expected reward
	if (bestPickupOption != undefined) {
		if (deliveryOption != undefined) {
			// If there is a possible pickup and also a possible deliver, then check the highest reward
			if (bestPickupOption[4] < deliveryOption[1]) {
				// If the reward of the delivery option is greater, then choose it
				return deliveryOption;
			} else {
				// If the reward of the pickup option is greater, then choose it
				return bestPickupOption;
			}
		} else {
			// If I have a pickup option but no deliver, then choose the pickup option
			return bestPickupOption;
		}
	} else {
		// If I have a deliver option but no pickup, then choose the delivery option
		if (deliveryOption != undefined) {
			return deliveryOption;
		} else {
			// If I have no delivery option and no pickup option, I will select the explore later
			return undefined;
		}
	}
}

/**
 * Generate all possible options, based on the current game state and configuration, perform option filtering and select the best possible option as current intention
 */
function optionsGeneration() {
	if (!block_option_generation_flag && !block_option_generation_planning_flag) {
		block_option_generation_flag = true;
		// Get the best option between go_pick_up and go_deliver
		let bestOption = getBestOption();

		let push = false;

		// Check if I should push the best option without waiting to finish the current intention
		if (bestOption != undefined) {
			// Get current intention
			let currentIntention = myAgent.getCurrentIntention();

			// Check if I have a current intention
			if (currentIntention == undefined) {
				// If not, then push the best option
				push = true;
			} else {
				// Otherwise, check if the best option reward is better than the current intention reward
				if (bestOption[0] == "go_pick_up") {
					if (currentIntention[0] == "go_pick_up") {
						if (bestOption[4] > currentIntention[4]) {
							push = true;
						}
					} else if (currentIntention[0] == "go_deliver") {
						if (bestOption[4] > currentIntention[1]) {
							push = true;
						}
					} else {
						// If the current intention is neither go_pick_up nor go_deliver, then push the best option
						push = true;
					}
				} else if (bestOption[0] == "go_deliver") {
					if (currentIntention[0] == "go_pick_up") {
						if (bestOption[1] > currentIntention[4]) {
							push = true;
						}
					} else if (currentIntention[0] == "go_deliver") {
						// I am already delivering, so I don't want to push another deliver
						push = false;
					} else {
						// If the current intention is neither go_pick_up nor go_deliver, then push the best option
						push = true;
					}
				}

				// If my best option is go_deliver but my current intention is go_pick_up
				if (currentIntention[0] == "go_pick_up" && bestOption[0] == "go_deliver") {
					// First finish the go_pick_up, to avoid that the agent moves towards the cell with the parcel to pickup and then change direction to go deliver
					block_option_generation_flag = false;
					return;
				}
			}

			// Check if I should push
			if (push && !block_option_generation_planning_flag) {
				myAgent.push(bestOption);
			}
		} else if (!block_option_generation_planning_flag) {
			// If I do not have a valid best option, then explore
			if (Math.random() < TIMED_EXPLORE) {
				// Explore oldest tiles
				myAgent.push(["explore", "timed"]);
			} else {
				// Explore distant tiles
				myAgent.push(["explore", "distance"]);
			}
		}
		block_option_generation_flag = false;
	}
}

async function memoryRevisionLoop(time) {
	while (true) {
		await new Promise((res) => setTimeout(res, time));
		belief.reviseMemory();
	}
}

// ---------------------------------------------------------------------------------------------------------------

const client = new DeliverooApi(SERVER_ADDRS, AGENT_TOKEN);
const belief = new BeliefSet();
const myAgent = new IntentionRevisionReplace();

myAgent.addPlan(Explore);
myAgent.addPlan(GoPickUp);
myAgent.addPlan(GoDeliver);
myAgent.addPlan(FollowPath);
//myAgent.addPlan(BFSmove);
myAgent.addPlan(PDDLmove);

myAgent.loop();

client.onParcelsSensing(async (pp) => {
	belief.onParcelSensingUpdate(pp);
});

client.onAgentsSensing(async (aa) => {
	belief.onAgentSensingUpdate(aa);
});

client.onYou(({ id, name, x, y, score }) => {
	belief.onYouUpdate(id, name, x, y, score);
});

myAgent.loop();

await new Promise((res) => {
	// Get the map information
	client.onMap((width, height, tile) => {
		belief.instantiateGameMap(width, height, tile);
		belief.generatePlanningBeliefSetMap();
		res();
	});

	// Get the configuration
	client.onConfig((config) => {
		// Add some constants to the game config
		config.MAX_EXPLORABLE_SPAWN_CELLS = MAX_EXPLORABLE_SPAWN_CELLS;
		config.INVIEW_MEMORY_DIFFERENCE_THRESHOLD = INVIEW_MEMORY_DIFFERENCE_THRESHOLD;
		config.OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD = OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD;

		config.PARCEL_DISTANCE_LOW = PARCEL_DISTANCE_LOW;
		config.PARCEL_DISTANCE_MID = PARCEL_DISTANCE_MID;
		config.PARCEL_DISTANCE_HIGH = PARCEL_DISTANCE_HIGH;
		config.PARCEL_WEIGHT_LOW = PARCEL_WEIGHT_LOW;
		config.PARCEL_WEIGHT_MID = PARCEL_WEIGHT_MID;
		config.PARCEL_WEIGHT_HIGH = PARCEL_WEIGHT_HIGH;

		belief.instantiateGameConfig(config);

		memoryRevisionLoop(500);
		res();
	});
});

while (true) {
	await new Promise((res) => setTimeout(res, 500));
	optionsGeneration();
}
