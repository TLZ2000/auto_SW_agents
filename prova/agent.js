import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { BeliefSet } from "./BeliefSet.js";
import { IntentionRevisionReplace, Plan } from "./Intentions.js";

// TODO: spostare in belief
const AGENT1_ID = "a6cdae";
const AGENT2_ID = "ff8ff0";

const AGENT1_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE2Y2RhZSIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnNfMSIsInRlYW1JZCI6ImM1MTFhNCIsInRlYW1OYW1lIjoiVGhlIFJvYm9TYXBpZW5zIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDgzNTk4NTF9.ESkRP2T4LIP4z2ghpnmKFb-xkXldwNhaR2VShlL0dm4";
const AGENT2_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZmOGZmMCIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnNfMiIsInRlYW1JZCI6ImMzZTljYSIsInRlYW1OYW1lIjoiVGhlIFJvYm9TYXBpZW5zIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDgzNTk4NTV9.OOBVcCXkUxyLwY8OyDo6v8hfHiijKcAI2MRvOsrFJmA";
const SERVER_ADDRS = "http://localhost:8080";

const client = new DeliverooApi(SERVER_ADDRS, AGENT1_TOKEN);
const belief = new BeliefSet();
const myAgent = new IntentionRevisionReplace();
myAgent.loop();

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
				if (carriedParcels.length > 0) {
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
				if (carriedParcels.length > 0) {
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
 * Generate all possible options, based on the current game state and configuration, perform option filtering and select the best possible option as current intention
 */
function optionsGeneration() {
	// Recover all the parcels I am carrying and the path to the nearest delivery
	let carriedParcels = carryingParcels();

	// Find path to the nearest delivery
	let pathNearestDelivery = nearestDeliveryFromHerePath(Math.round(me.x), Math.round(me.y));

	const options = [];

	// Cycle all free parcels in belief
	for (const parcel of belief.getFreeParcels()) {
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
				// Otherwise, compute and save the current expected reward for this parcel from the current agent's position
				let tmpReward = [];
				if (me.parcels2Ignore.has(parcel.id)) {
					tmpReward = [0, Infinity];
				} else {
					tmpReward = expectedRewardCarriedAndPickup(carriedParcels, parcel);
				}*/

			let tmpReward = expectedRewardCarriedAndPickup(carriedParcels, parcel);

			options.push([
				"go_pick_up",
				parcel.x, // X coord
				parcel.y, // Y coord
				parcel.id, // ID
				tmpReward[0], // Expected reward
				tmpReward[1], // length of the path to pickup the parcel
			]);
		}
	}

	// Options filtering
	let best_option = undefined;
	let maxExpectedScore = 0;
	let minDistance = 0;

	// Select best pickup option
	options.forEach((option) => {
		let currentExpectedScore = 0;
		let currentDistance = 0;
		if (option[0] == "go_pick_up") {
			currentExpectedScore = option[4];
			currentDistance = option[5];
		}

		// Check the best expected score
		if (currentExpectedScore > maxExpectedScore) {
			maxExpectedScore = currentExpectedScore;
			minDistance = currentDistance;
			best_option = option;
		} else if (currentExpectedScore == maxExpectedScore) {
			// If same expected score, then select the nearest parcel
			if (currentDistance < minDistance) {
				best_option = option;
				minDistance = currentDistance;
			}
		}
	});

	// Define a delivery option
	let delivery_option = undefined;
	// Check if we are carrying parcels, so it makes sense to deliver them
	if (carriedParcels.length != 0) {
		// Check if we are in a delivery cell
		if (grafo.gameMap.getItem(Math.round(me.x), Math.round(me.y)).type == 2) {
			// If so, deliver
			delivery_option = ["go_deliver", Infinity];
		} else {
			if (currentConfig.PARCEL_DECADING_INTERVAL == "infinite") {
				// If there is no parcel decay, then increase the expected reward of the carried parcels using a dedicated scale factor
				delivery_option = ["go_deliver", expectedRewardOfCarriedParcels(carriedParcels, pathNearestDelivery) * (me.moves / MOVES_SCALE_FACTOR_NO_DECAY + 1)];
			} else {
				// If there is parcel decay, let the user weight the parcel reward increase
				delivery_option = ["go_deliver", expectedRewardOfCarriedParcels(carriedParcels, pathNearestDelivery) * (me.moves / MOVES_SCALE_FACTOR + 1)];
			}
		}
	}

	// Select the deliver option or pickup option (aka. best_option) based on the highest expected reward
	if (best_option) {
		if (delivery_option) {
			// If there is a possible pickup and also a possible deliver, then check the highest reward
			if (best_option[4] < delivery_option[1]) {
				best_option = delivery_option;
			}
		} else {
			// If I have a pickup option but no deliver, then do nothing
		}
	} else {
		// If I have no pickup options, then the best option is the delivery by default (if I have no delivery, I will select the explore later)
		best_option = delivery_option;
	}

	/**
	 * Best option is selected
	 */
	let push = false;

	if (best_option) {
		// Get current intention
		let currentIntention = myAgent.getCurrentIntention();
		if (currentIntention == undefined) {
			push = true;
		} else {
			// Check if the best option reward is better than the current intention reward
			if (best_option[0] == "go_pick_up") {
				if (currentIntention[0] == "go_pick_up") {
					if (best_option[4] > currentIntention[4]) {
						push = true;
					}
				} else if (currentIntention[0] == "go_deliver") {
					if (best_option[4] > currentIntention[1]) {
						push = true;
					}
				} else {
					// Explore
					push = true;
				}
			} else if (best_option[0] == "go_deliver") {
				if (currentIntention[0] == "go_pick_up") {
					if (best_option[1] > currentIntention[4]) {
						push = true;
					}
				} else if (currentIntention[0] == "go_deliver") {
					// I am already delivering, so I don't want to push another deliver
					push = false;
				} else {
					push = true;
				}
			}

			// If my best option is go_deliver but my current intention is go_pick_up
			if (currentIntention[0] == "go_pick_up" && best_option[0] == "go_deliver") {
				// First finish the go_pick_up
				return;
			}
		}

		// If yes, ask if the pal is ok with my decision
		if (push) {
			// Signal the pending response
			me.pendingOptionRequest = true;
			askPalOption(best_option);
		}
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

myAgent.addPlan(BFSmove);
myAgent.addPlan(Explore);

/*
 * TODO sistemare parametri
// Recover command line arguments
// print process.argv
process.argv.forEach(function (val, index, array) {
	if (val == "-a") {
		if (process.argv[index + 1] == "1") {
			// I am AGENT1
			me.multiAgent_myID = AGENT1_ID;
			me.multiAgent_palID = AGENT2_ID;
			me.myToken = AGENT1_TOKEN;
		} else {
			// I am AGENT2
			me.multiAgent_myID = AGENT2_ID;
			me.multiAgent_palID = AGENT1_ID;
			me.myToken = AGENT2_TOKEN;
		}
	}
});
*/

client.onParcelsSensing(async (pp) => {
	belief.onParcelSensingUpdate(pp);
});

client.onAgentsSensing(async (aa) => {
	belief.onAgentSensingUpdate(aa);
});

client.onYou(({ id, name, x, y, score }) => {
	belief.onYouUpdate(id, name, x, y, score);

	// TODO insert in onYouUpdate
	//sendPosition2Pal();
	//reviseMemory(true);
});

await new Promise((res) => {
	// Get the map information
	client.onMap((width, height, tile) => {
		belief.instantiateGameMap(width, height, tile);
		belief.printRaw();
		res();
	});

	// Get the configuration
	client.onConfig((config) => {
		belief.instantiateGameConfig(config);
		res();
	});
});

while (true) {
	await new Promise((res) => setTimeout(res, 5000));
	myAgent.push(["explore", "distance"]);
}
