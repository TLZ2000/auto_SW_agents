import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { BeliefSet } from "./BeliefSet.js";
import { IntentionRevisionReplace, Plan } from "./Intentions.js";

const AGENT1_ID = "a6cdae";
const AGENT2_ID = "ff8ff0";

const AGENT1_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE2Y2RhZSIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnNfMSIsInRlYW1JZCI6ImM1MTFhNCIsInRlYW1OYW1lIjoiVGhlIFJvYm9TYXBpZW5zIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDgzNTk4NTF9.ESkRP2T4LIP4z2ghpnmKFb-xkXldwNhaR2VShlL0dm4";
const AGENT2_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZmOGZmMCIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnNfMiIsInRlYW1JZCI6ImMzZTljYSIsInRlYW1OYW1lIjoiVGhlIFJvYm9TYXBpZW5zIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDgzNTk4NTV9.OOBVcCXkUxyLwY8OyDo6v8hfHiijKcAI2MRvOsrFJmA";
const SERVER_ADDRS = "http://localhost:8080";
// const SERVER_ADDRS = "https://deliveroojs.rtibdi.disi.unitn.it";
// const SERVER_ADDRS = "https://deliveroojs25.azurewebsites.net";

const MAX_EXPLORABLE_SPAWN_CELLS = 100;
const INVIEW_MEMORY_DIFFERENCE_THRESHOLD = 2000; // Threshold for parcels and agent in our vision range
const OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD = 10000; // Threshold for parcels and agent not in our vision range

const PARCEL_DISTANCE_LOW = 3;
const PARCEL_DISTANCE_MID = 6;
const PARCEL_DISTANCE_HIGH = 10;
const PARCEL_WEIGHT_LOW = 10;
const PARCEL_WEIGHT_MID = 5;
const PARCEL_WEIGHT_HIGH = 2.5;

const MOVES_SCALE_FACTOR = 100; // Lower values mean I want to deliver more often
const MOVES_SCALE_FACTOR_NO_DECAY = 40; // Lower values mean I want to deliver more often

const TIMED_EXPLORE_ALPHA = 5;
const TIMED_EXPLORE_BETA = 1;

const TIMED_EXPLORE = 0.99;
const OPTION_GENERATION_INTERVAL = 50;
const MEMORY_REVISION_INTERVAL = 250;
const SHARE_PARCEL_TIMEOUT = 3000;
const SHARE_PARCEL_WAIT_MUX = 4;
const RECOVER_PARCEL_WAIT_MUX = 2;

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

		// If I have no valid coordinates to explore
		if (coords[0] == undefined || coords[0] == null) {
			// Then the best thing to do is to move to the nearest delivery (probably I am in a corridor with the pal in the middle, so I give him space to do its things)
			// Compute the nearest delivery position
			coords = belief.nearestDeliveryFromHere()[0];

			// If I have no valid delivery coordinates
			if (coords[0] == undefined || coords[0] == null) {
				// Then the action is concluded
				return true;
			}
		}

		// When a valid cell has been found, move to it (and hope to find something interesting)
		await this.subIntention(["go_to", coords[0], coords[1]], myAgent.getPlanLibrary());
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

/**
 * Plan class handling the "share_parcels" intention
 */
class ShareParcels extends Plan {
	static isApplicableTo(share_parcels) {
		return share_parcels == "share_parcels";
	}

	async execute(share_parcels) {
		belief.requireCoop();

		if (this.stopped) {
			belief.releaseCoop();
			throw ["stopped"]; // if stopped then quit
		}

		// Share request
		let askOutcome = false;
		let response = undefined;
		while (!askOutcome) {
			response = await myEmitAsk("MSG_shareRequest", JSON.stringify({ x: Math.round(belief.getMePosition()[0]), y: Math.round(belief.getMePosition()[1]) }));

			if (this.stopped) {
				belief.releaseCoop();
				throw ["stopped"]; // if stopped then quit
			}

			// If pal returns false, stop the intention
			if (response.outcome == "false") {
				belief.releaseCoop();
				this.stop();
				throw ["refused"];
			} else if (response.outcome == "you_move") {
				// This mean that I have to move to give the pal space to act, so I will compute a path of 4 positions
				let path = belief.pathFromHereOfLength(4)[1];

				// If there is a viable path
				if (path != null) {
					// Then move to have at least 4 free positions between me and the pal
					for (let i = 0; i < response.missingCells; i++) {
						await myEmitMove(path[i]);
					}
				} else {
					// Otherwise return error
					belief.releaseCoop();
					this.stop();
					throw ["no free path"];
				}
			} else if (response.outcome == "true") {
				// Otherwise, if all is fine I can proceed with the share
				askOutcome = true;
			}
		}

		if (this.stopped) {
			belief.releaseCoop();
			throw ["stopped"]; // if stopped then quit
		}

		// TODO ricontrollare altri possibili try/catch
		try {
			await this.subIntention(["go_to", response.yourPosX, response.yourPosY], myAgent.getPlanLibrary());
		} catch (err) {
			belief.releaseCoop();
			throw [err];
		}

		// When I arrive to the designated position I must wait and see if also the pal is in his designated position
		let time = Date.now();
		let palOK = false;
		while (Date.now() < time + SHARE_PARCEL_TIMEOUT && !palOK) {
			if (this.stopped) {
				belief.releaseCoop();
				throw ["stopped"]; // if stopped then quit
			}

			// Allow the execution to serve messages
			await new Promise((res) => setTimeout(res, 1));

			// Check if the pal is in his accorded position
			if (belief.isPalHere(response.mePosX, response.mePosY)) {
				palOK = true;
			}
		}

		if (this.stopped) {
			belief.releaseCoop();
			throw ["stopped"]; // if stopped then quit
		}

		// If the pal is in the correct position, I can commit to the share
		if (palOK) {
			// Ignore the parcels we are carrying now (so we don't ever pick them up again)
			belief.ignoreCarriedParcels();

			// Drop them
			await myEmitPutDown();

			// Move to support position
			try {
				await this.subIntention(["go_to", response.yourSupportPosX, response.yourSupportPosY], myAgent.getPlanLibrary());
			} catch (err) {
				belief.releaseCoop();
				throw [err];
			}
			// Give time to the pal to move and pick the parcels up
			await new Promise((res) => setTimeout(res, belief.getAgentMovementDuration() * SHARE_PARCEL_WAIT_MUX));
		} else {
			// Otherwise something wrong has happened so I can invalidate this action
			belief.releaseCoop();
			this.stop();
			throw ["pal timed out"]; // if stopped then quit
		}

		// Then the action is finished, a new option generation will be triggered and I will move out of the way
		belief.releaseCoop();
		return true;
	}
}

/**
 * Plan class handling the "recover_shared_parcels" intention
 */
class RecoverSharedParcels extends Plan {
	static isApplicableTo(recover_shared_parcels) {
		return recover_shared_parcels == "recover_shared_parcels";
	}

	async execute(recover_shared_parcels, mePosX, mePosY, yourPosX, yourPosY) {
		belief.requireCoop();

		if (this.stopped) {
			belief.releaseCoop();
			throw ["stopped"]; // if stopped then quit
		}

		// Move to my accorded position
		try {
			await this.subIntention(["go_to", mePosX, mePosY], myAgent.getPlanLibrary());
		} catch (err) {
			belief.releaseCoop();
			throw [err];
		}

		// When I arrive to the designated position I must wait and see if also the pal is in his designated position
		let time = Date.now();
		let palOK = false;
		while (Date.now() < time + SHARE_PARCEL_TIMEOUT && !palOK) {
			if (this.stopped) {
				belief.releaseCoop();
				throw ["stopped"]; // if stopped then quit
			}

			// Allow the execution to serve messages
			await new Promise((res) => setTimeout(res, 1));

			// Check if the pal is in his accorded position (required the floor to cover the case in which the pal agent already dropped his parcel and is currently moving away, so floated coordinates)
			if (belief.isPalHereFloor(yourPosX, yourPosY)) {
				palOK = true;
			}
		}

		if (this.stopped) {
			belief.releaseCoop();
			throw ["stopped"]; // if stopped then quit
		}

		// If the pal is in the correct position, I can commit to the share
		if (palOK) {
			// Wait until the pal is out of the way
			while (belief.isPalHereFloor(yourPosX, yourPosY)) {
				// Allow the execution to serve messages
				await new Promise((res) => setTimeout(res, 1));
				if (this.stopped) {
					belief.releaseCoop();
					throw ["stopped"]; // if stopped then quit
				}
			}

			// Give time to the pal to move out of the way
			await new Promise((res) => setTimeout(res, belief.getAgentMovementDuration() * RECOVER_PARCEL_WAIT_MUX));

			if (this.stopped) {
				belief.releaseCoop();
				throw ["stopped"]; // if stopped then quit
			}

			// Go and pick up the shared parcel
			try {
				await this.subIntention(["go_pick_up", yourPosX, yourPosY], myAgent.getPlanLibrary());
			} catch (err) {
				belief.releaseCoop();
				throw [err];
			}
		} else {
			// Otherwise something wrong has happened so I can invalidate this action
			belief.releaseCoop();
			this.stop();
			throw ["pal timed out"]; // if stopped then quit
		}

		// Then the action is finished, a new option generation will be triggered and I will move out of the way
		belief.releaseCoop();
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

			// If I am not at the final position already
			// TODO ricorda di scrivere che a volte funziona e a volte no
			if (i < path.length - 1) {
				// If I am on a parcel
				if (belief.amIOnParcelLong()) {
					// Then force a pickup because it is free
					await myEmitPickUp();
				}

				// If I am on a deliver and I am carrying parcels
				if (belief.amIOnDelivery() && belief.getCarriedParcels().size > 0) {
					// Then deliver the parcels because it is free
					await myEmitPutDown();
				}
			}

			// Check if the next position is free to move
			if (!belief.isNextCellFree(path[i])) {
				// If not, fail the action and stop here
				this.stop();
				throw ["stopped"];
			}

			// Otherwise commit to the move
			let moved_horizontally = undefined;
			let moved_vertically = undefined;

			if (path[i] == "R" || path[i] == "L") {
				moved_horizontally = await myEmitMove(path[i]);
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

			if (path[i] == "U" || path[i] == "D") {
				moved_vertically = await myEmitMove(path[i]);
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
				this.stop();
				throw ["stopped"];
			}

			// Consider next position
			i++;
		}
		return true;
	}
}

/**
 * Plan class handling the "follow_path" intention
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

			// If I am not at the final position already
			if (i < path.length - 1) {
				// If I am on a parcel
				if (belief.amIOnParcelLong()) {
					// Then force a pickup because it is free
					await myEmitPickUp();
				}

				// If I am on a deliver and I am carrying parcels
				if (belief.amIOnDelivery() && belief.getCarriedParcels().size > 0) {
					// Then deliver the parcels because it is free
					await myEmitPutDown();
				}
			}

			// Check if the next position is free to move
			if (!belief.isNextCellFree(path[i])) {
				// If not, fail the action and stop here
				this.stop();
				throw ["stopped"];
			}

			// Otherwise commit to the move
			let moved_horizontally = undefined;
			let moved_vertically = undefined;

			if (path[i] == "R" || path[i] == "L") {
				moved_horizontally = await myEmitMove(path[i]);
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

			if (path[i] == "U" || path[i] == "D") {
				moved_vertically = await myEmitMove(path[i]);
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
				this.stop();
				throw ["stopped"];
			}

			// Consider next position
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
		return go_pick_up == "go_pick_up";
	}

	async execute(go_pick_up, x, y) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await this.subIntention(["go_to", x, y], myAgent.getPlanLibrary());
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await myEmitPickUp();
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
		await myEmitPutDown();
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

/**
 * Consider all the go_pick_up options and return the one with highest reward
 * * @returns {Array} bestOption containing specifications of best go_pick_up option, null if no go_pick_up option exists
 */
function getBestPickupOption() {
	const options = [];

	// Cycle all free parcels in belief
	belief.getFreeParcels().forEach((parcel) => {
		// Compute the reward of the single parcel
		let tmpReward = belief.expectedRewardCarriedAndPickupMe(parcel, true);
		let tmpPalReward = belief.expectedRewardCarriedAndPickupPal(parcel, true);

		// If I can't reach this parcel, then don't create the option
		if (tmpReward == null || tmpReward == undefined) {
			return;
		}

		// Push the pickup option only if my reward is higher than the pal, or same reward and smaller distance, or the pal intention is to deliver (it ignores the parcel)
		if (tmpReward[0] > tmpPalReward[0] || (tmpReward[0] == tmpPalReward[0] && tmpReward[1] <= tmpPalReward[1]) || belief.getPalCurrentIntention() == "go_deliver") {
			// Re-compute the reward considering also the carried parcels
			tmpReward = belief.expectedRewardCarriedAndPickupMe(parcel);
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
	let bestOption = null;
	let maxExpectedScore = 0;
	let minDistance = 0;

	// Select best pickup option
	options.forEach((option) => {
		let currentExpectedScore = 0;
		let currentDistance = 0;
		currentExpectedScore = option[4];
		currentDistance = option[5];

		// Check the best expected score
		if (currentExpectedScore > maxExpectedScore) {
			maxExpectedScore = currentExpectedScore;
			minDistance = currentDistance;
			bestOption = option;
		} else if (currentExpectedScore == maxExpectedScore) {
			// If same expected score, then select the nearest parcel
			if (currentDistance <= minDistance) {
				minDistance = currentDistance;
				bestOption = option;
			}
		}
	});

	return bestOption;
}

/**
 * Find and return the go_delivery option considering the nearest delivery
 * @returns {Array} deliveryOption containing specifications of nearest go_delivery option, null if no go_delivery option exists
 */
function getDeliveryOption() {
	// Define a delivery option
	let deliveryOption = null;

	// Check if we are carrying parcels, so it makes sense to deliver them
	if (belief.getCarriedParcels().size > 0) {
		// Get the path to the nearest delivery
		let pathNearestDelivery = belief.nearestDeliveryFromHere()[1];

		// If there is no viable path to a delivery
		if (pathNearestDelivery == null || pathNearestDelivery == undefined) {
			// Then I have no delivery option
			return null;
		}

		if (belief.getParcelDecayInterval() == Infinity) {
			// If there is no parcel decay, then increase the expected reward of the carried parcels using a dedicated scale factor
			deliveryOption = ["go_deliver", belief.expectedRewardOfCarriedParcels(pathNearestDelivery, belief.getCarriedParcels()) * (belief.getMeMoves() / MOVES_SCALE_FACTOR_NO_DECAY + 1), pathNearestDelivery];
		} else {
			// If there is parcel decay, let the user weight the parcel reward increase
			deliveryOption = ["go_deliver", belief.expectedRewardOfCarriedParcels(pathNearestDelivery, belief.getCarriedParcels()) * (belief.getMeMoves() / MOVES_SCALE_FACTOR + 1), pathNearestDelivery];
		}
	}

	// Re-check if I am still carrying parcels, just to be sure
	if (belief.getCarriedParcels().size > 0) {
		// If so, return the delivery option
		return deliveryOption;
	}
	// Otherwise, it means that I already delivered the parcels, so there is no point in returning a delivery option
	return null;
}

/**
 * Find and return the best option between go_pick_up and go_deliver
 * @returns {Array} option containing specifications of best option, null if no option exists
 */
function getBestOption() {
	// Compute options
	let bestPickupOption = getBestPickupOption();
	let deliveryOption = getDeliveryOption();

	// Select the deliver option or pickup option (aka. best_option) based on the highest expected reward
	if (bestPickupOption != null) {
		if (deliveryOption != null) {
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
		if (deliveryOption != null) {
			return deliveryOption;
		} else {
			// If I have no delivery option and no pickup option, I will select the explore later
			return null;
		}
	}
}

/**
 * Generate all possible options, based on the current game state and configuration, perform option filtering and select the best possible option as current intention
 */
function optionsGeneration() {
	// Check if the option generation is allowed (no other option generation is running)
	if (belief.isOptionGenerationAllowed()) {
		// Signal that an option generation is currently running
		belief.setOptionGenerationRunning();

		// Get the best option between go_pick_up and go_deliver
		let bestOption = getBestOption();
		let push = false;

		// Check if I should push the best option without waiting to finish the current intention
		if (bestOption != undefined && bestOption != null) {
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
					belief.setOptionGenerationNotRunning();
					return;
				}
			}

			// Check if I should push
			if (push) {
				pushIntention(bestOption);
			}
		} else {
			// If I have no valid option, then...
			// If I am carrying parcels and I can reach the pal
			let pathToPal = belief.pathFromMeToPal();
			// TODO aggiungi undefined a tutti i null
			if (belief.getCarriedParcels().size > 0 && pathToPal != null && pathToPal != undefined) {
				// Then co-op with pal to deliver
				pushIntention(["share_parcels"]);
			} else {
				// Otherwise explore
				if (Math.random() < TIMED_EXPLORE) {
					// Explore oldest tiles
					pushIntention(["explore", "timed"]);
				} else {
					// Explore distant tiles
					pushIntention(["explore", "distance"]);
				}
			}
		}

		// Signal that the option generation is finished
		belief.setOptionGenerationNotRunning();
	}
}

/**
 * myAgent.push wrapper to avoid pushing intentions while cooperating with the pal and also to signal the pal my current intention
 * @param {Array} intention - intention to push
 */
function pushIntention(intention) {
	if (!belief.isCooperating()) {
		myAgent.push(intention);
		myEmitSay("MSG_currentIntention", intention[0]);
	} else {
		console.log("Push of ", intention, " failed due to coop");
	}
}

/**
 * Call the reviseMemory function every time milliseconds
 * @param time - time in milliseconds
 */
async function memoryRevisionLoop(time) {
	while (true) {
		await new Promise((res) => setTimeout(res, time));
		belief.reviseMemory();
		myEmitSay("MSG_memoryShare", belief.messageContent_memoryShare());
	}
}

/**
 * emitMove wrapper to force a single emit action execution in parallel
 * @param {String} direction - direction to move
 * @returns output of emitMove
 */
async function myEmitMove(direction) {
	let moved = undefined;
	if (belief.requireEmit()) {
		if (direction == "R") {
			moved = await client.emitMove("right");
		} else if (direction == "L") {
			moved = await client.emitMove("left");
		} else if (direction == "U") {
			moved = await client.emitMove("up");
		} else if (direction == "D") {
			moved = await client.emitMove("down");
		}
		belief.releaseEmit();
	} else {
		console.log("TOO FAST");
	}
	return moved;
}

/**
 * emitPickup wrapper to force a single emit action execution in parallel
 * @returns output of emitPickup
 */
async function myEmitPickUp() {
	let pick = undefined;
	if (belief.requireEmit()) {
		pick = await client.emitPickup();
		belief.releaseEmit();
	} else {
		console.log("TOO FAST");
	}
	return pick;
}

/**
 * emitPutdown wrapper to force a single emit action execution in parallel
 * @returns output of emitPutdown
 */
async function myEmitPutDown() {
	let pick = undefined;
	if (belief.requireEmit()) {
		pick = await client.emitPutdown();
		belief.resetMeMoves();
		belief.resetCarriedParcels();
		belief.releaseEmit();
	} else {
		console.log("TOO FAST");
	}
	return pick;
}

/**
 * emitSay wrapper
 * @param {String} msg_type - message type
 * @param {String} msg_content - message content in JSON format
 */
async function myEmitSay(msg_type, msg_content) {
	await client.emitSay(belief.getPalId(), { type: msg_type, content: msg_content });
}

/**
 * emitAsk wrapper
 * @param {String} msg_type - message type
 * @param {String} msg_content - message content in JSON format
 * @returns output of emitAsk
 */
async function myEmitAsk(msg_type, msg_content) {
	return await client.emitAsk(belief.getPalId(), { type: msg_type, content: msg_content });
}

// ---------------------------------------------------------------------------------------------------------------

const belief = new BeliefSet();

// Recover command line arguments
process.argv.forEach(function (val, index, array) {
	if (val == "-a") {
		if (process.argv[index + 1] == "1") {
			// I am AGENT1
			belief.setAgentsInfo(AGENT1_ID, AGENT1_TOKEN, AGENT2_ID, AGENT2_TOKEN);
		} else {
			// I am AGENT2
			belief.setAgentsInfo(AGENT2_ID, AGENT2_TOKEN, AGENT1_ID, AGENT1_TOKEN);
		}
	}
});

const client = new DeliverooApi(SERVER_ADDRS, belief.getMyToken());
const myAgent = new IntentionRevisionReplace();

// Add plans to the plan library
myAgent.addPlan(Explore);
myAgent.addPlan(GoPickUp);
myAgent.addPlan(GoDeliver);
myAgent.addPlan(FollowPath);
myAgent.addPlan(BFSmove);
myAgent.addPlan(ShareParcels);
myAgent.addPlan(RecoverSharedParcels);

myAgent.loop();

// Callbacks
client.onParcelsSensing(async (pp) => {
	belief.onParcelSensingUpdate(pp);
});

client.onAgentsSensing(async (aa) => {
	belief.onAgentSensingUpdate(aa);
});

client.onYou(({ id, name, x, y, score }) => {
	belief.onYouUpdate(id, name, x, y, score);
	//Send to pal my updated position info
	myEmitSay("MSG_positionUpdate", belief.messageContent_positionUpdate());
});

await new Promise((res) => {
	// Get the map information
	client.onMap((width, height, tile) => {
		belief.instantiateGameMap(width, height, tile);
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

		config.TIMED_EXPLORE_ALPHA = TIMED_EXPLORE_ALPHA;
		config.TIMED_EXPLORE_BETA = TIMED_EXPLORE_BETA;

		belief.instantiateGameConfig(config);

		memoryRevisionLoop(MEMORY_REVISION_INTERVAL);
		res();
	});
});

client.onMsg(async (id, name, msg, reply) => {
	switch (msg.type) {
		case "MSG_positionUpdate":
			belief.messageHandler_positionUpdate(msg.content);
			break;
		case "MSG_memoryShare":
			belief.messageHandler_memoryShare(msg.content);
			break;
		case "MSG_currentIntention":
			belief.messageHandler_currentIntention(msg.content);
			break;
		case "MSG_shareRequest":
			while (true) {
				// Allow message handling while in loop
				await new Promise((res) => setTimeout(res, 1));

				// Compte response to the share request
				let response = belief.messageHandler_shareRequest(msg.content);
				if (response.outcome == "true") {
					// If the response is positive, then we can proceed with the share
					pushIntention(["recover_shared_parcels", response.mePosX, response.mePosY, response.yourPosX, response.yourPosY, response.yourSupportPosX, response.yourSupportPosY]);
					belief.requireCoop();
					reply(response);
					break;
				} else if (response.outcome == "false") {
					// If the response is negative, signal it to the pal
					reply(response);
					break;
				} else if (response.outcome == "me_move") {
					// If I have to move to gain free spaces before committing to the share, do so and repeat the process
					for (let i = 0; i < response.missingCells; i++) {
						await myEmitMove(response.path[i]);
					}
				} else if (response.outcome == "you_move") {
					// If the pal has to move to gain free spaces before committing to the share, signal him so
					reply(response);
					break;
				}
			}
			break;
	}
});

// Initialize the option generation loop every OPTION_GENERATION_INTERVAL milliseconds
while (true) {
	await new Promise((res) => setTimeout(res, OPTION_GENERATION_INTERVAL));
	optionsGeneration();
}
