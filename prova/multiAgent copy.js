import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
const AGENT1_ID = "a6cdae";
const AGENT2_ID = "ff8ff0";

const AGENT1_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE2Y2RhZSIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnNfMSIsInRlYW1JZCI6ImM1MTFhNCIsInRlYW1OYW1lIjoiVGhlIFJvYm9TYXBpZW5zIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDgzNTk4NTF9.ESkRP2T4LIP4z2ghpnmKFb-xkXldwNhaR2VShlL0dm4";
const AGENT2_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZmOGZmMCIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnNfMiIsInRlYW1JZCI6ImMzZTljYSIsInRlYW1OYW1lIjoiVGhlIFJvYm9TYXBpZW5zIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDgzNTk4NTV9.OOBVcCXkUxyLwY8OyDo6v8hfHiijKcAI2MRvOsrFJmA";
const SERVER_ADDRS = "http://localhost:8080";
// const SERVER_ADDRS = "https://deliveroojs.rtibdi.disi.unitn.it";

const SPAWN_NON_SPAWN_RATIO = 0.5;
const DELIVERY_AREA_EXPLORE = 0;
const TIMED_EXPLORE = 0.99;
const INVIEW_MEMORY_DIFFERENCE_THRESHOLD = 2000; // Threshold for parcels and agent in our vision range
const OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD = 10000; // Threshold for parcels and agent not in our vision range
const MOVES_SCALE_FACTOR = 30; // Lower values mean I want to deliver more often
const MOVES_SCALE_FACTOR_NO_DECAY = 5; // Lower values mean I want to deliver more often
const MEMORY_REVISION_TIMER = 10000;
const MEMORY_SHARE_TIMER = 1500;
const MAX_EXPLORABLE_SPAWN_CELLS = 100;
const MEMORY_REVISION_PARCELS2IGNORE = 5000;
const RESTORE_OPTION_GENERATION_SCALE_FACTOR = 8;

const PARCEL_DISTANCE_LOW = 1;
const PARCEL_DISTANCE_MID = 2;
const PARCEL_DISTANCE_HIGH = 3;
const PARCEL_WEIGHT_LOW = 10;
const PARCEL_WEIGHT_MID = 5;
const PARCEL_WEIGHT_HIGH = 2.5;


/**
 * Base IntentionRevision class
 */
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
				let id = intention.predicate[2];
				let p = parcels.get(id);
				if (p && p.carriedBy) {
					console.log("Skipping intention because no more valid", intention.predicate);
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

/**
 * Implementation of the IntentionRevision class considering only a single current intention
 */
class IntentionRevisionReplace extends IntentionRevision {
	async push(predicate) {
		// Check if already queued
		const last = this.intention_queue.at(this.intention_queue.length - 1);

		if (last && last.predicate.join(" ") == predicate.join(" ")) {
			return; // intention is already being achieved
		}

		// If the current intention is a corridor_resolve, I must solve that first
		if (last && last.predicate[0] == "corridor_resolve") {
			return;
		}

		console.log("IntentionRevisionReplace.push", predicate);
		const intention = new Intention(this, predicate);
		this.intention_queue.push(intention);

		// Force current intention stop
		if (last) {
			last.stop();
		}
	}

	// Function to get the current intention
	getCurrentIntention() {
		if (this.intention_queue.at(this.intention_queue.length - 1)) {
			return this.intention_queue.at(this.intention_queue.length - 1).predicate;
		}
		return undefined;
	}

	stopCurrentIntention() {
		const last = this.intention_queue.at(this.intention_queue.length - 1);

		// Force current intention stop
		if (last) {
			last.stop();
		}
	}
}

/**
 * Base Intention class
 */
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
				this.log("achieving intention", ...this.predicate, "with plan", planClass.name);
				// and plan is executed and result returned
				try {
					const plan_res = await this.#current_plan.execute(...this.predicate);
					this.log("successful intention", ...this.predicate, "with plan", planClass.name, "with result:", plan_res);
					return plan_res;
					// or errors are caught so to continue with next plan
				} catch (error) {
					this.log("failed intention", ...this.predicate, "with plan", planClass.name, "with error:", error);
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

/**
 * Base Plan class
 */
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

/**
 * Plan class handling the "go_pick_up" intention
 */
class GoPickUp extends Plan {
	static isApplicableTo(go_pick_up, x, y, id) {
		return go_pick_up == "go_pick_up" /*|| go_pick_up == "emergency_go_pick_up"*/;
	}

	async execute(go_pick_up, x, y) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await this.subIntention(["go_to", x, y]);
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await client.emitPickup();

		// Say to pal what packages I am carrying
		await client.emitSay(me.multiAgent_palID, {
			type: "MSG_carryingPKG",
			content: JSON.stringify(carryingParcels()),
		});

		reviseMemory(true);
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

	async execute(go_deliver) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit

		// Find coordinates of the nearest delivery
		let nearestDelivery = nearestDeliveryFromHereCoords(Math.round(me.x), Math.round(me.y));

		await this.subIntention(["go_to", nearestDelivery[0], nearestDelivery[1]]);
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		await client.emitPutdown();
		reviseMemory(true);
		me.moves = 0;
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		return true;
	}
}

/**
 * Plan class handling the "corridor_resolve" intention
 */
class CorridorResolve extends Plan {
	static isApplicableTo(corridor_resolve) {
		return corridor_resolve == "corridor_resolve";
	}

	async execute(corridor_resolve) {
		if (this.stopped) throw ["stopped"]; // if stopped then quit
		let staleResolved = false;

		while(!staleResolved){
			if (this.stopped) throw ["stopped"]; // if stopped then quit
			
			console.log("SENDING: " + JSON.stringify({ intention: me.stoppedIntention, parcelsNo: carryingParcels().length, freeCells: checkFreeAdjacentCells() }));

			let response = await client.emitAsk(me.multiAgent_palID, { type: "MSG_corridor_initialState", content: JSON.stringify({ intention: me.stoppedIntention, parcelsNo: carryingParcels().length, freeCells: checkFreeAdjacentCells() }) });

			for(var i = 0; i < 10; i++){
					console.log("MSG_corridor_initialState RESPONSE " + response.outcome);
				}

			switch (response.outcome) {
				case "switch_intention":
					// Restart movement intention
					me.pendingBumpRequest = false;

					// Switch the intention with pal
					myAgent.push(response.content);

					// Restart option generation
					timedRestoreBumpOptionGenerationFlag();

					// Signal resolved stale
					staleResolved = true;
					break;
				case "drop_and_move":
					// Put down my parcels
					await client.emitPutdown();

					// Move away
					var myX = Math.round(me.x);
					var myY = Math.round(me.y);
					var myFreeCells = checkFreeAdjacentCells();
					while (myFreeCells.length == 0) {
						// Wait a movement duration
						console.log("WAITING FREE CELL: " + myFreeCells.length);
						await new Promise((res) => setTimeout(res, currentConfig.MOVEMENT_DURATION));
						myFreeCells = checkFreeAdjacentCells();
					}

					// Move to direction
					switch (myFreeCells[0]) {
						case "U":
							await client.emitMove("up");
							break;
						case "D":
							await client.emitMove("down");
							break;
						case "R":
							await client.emitMove("right");
							break;
						case "L":
							await client.emitMove("left");
							break;
					}

					// Signal pal agent to move and pickup
					let palResponse = await client.emitAsk(me.multiAgent_palID, { type: "MSG_corridorMovePickupIntention", content: JSON.stringify({ intention: me.stoppedIntention, moves: me.moves, moveToX: myX, moveToY: myY }) });

					// Restart movement intention
					me.pendingBumpRequest = false;

					// Switch the intention with pal
					me.moves = palResponse.moves;
					// TODO: vedere perché ogni tanto palResponse.content (intention che gli manda il pal) è undefined e fa crashare tutto
					// la mia idea è che succede quando l'agente 2 succeed l'intention e prima di riuscire a generarne un altra succede il bump, quindi la stoppedIntention è undefined
					// infatti ho notato che succede quando un agente è sulla deliver o sulla spawn (non solo in quei casi, ma anche in altri casi)
					myAgent.push(palResponse.content);

					// Restart option generation
					timedRestoreBumpOptionGenerationFlag();
					break;
				case "gain_space":
					var moveToX = response.moveToX;
					var moveToY = response.moveToY;

					console.log("GAIN SPACE TO: " + computeMovementDirection(moveToX, moveToY))


					// Move to direction
					switch (computeMovementDirection(moveToX, moveToY)) {
						case "U":
							await client.emitMove("up");
							break;
						case "D":
							await client.emitMove("down");
							break;
						case "R":
							await client.emitMove("right");
							break;
						case "L":
							await client.emitMove("left");
							break;
					}
					break;
				case "move_and_pickup":
					var moveToX = response.moveToX;
					var moveToY = response.moveToY;
					var palIntention = response.intention;
					var palMoves = response.moves;

					// Move to direction
					switch (computeMovementDirection(moveToX, moveToY)) {
						case "U":
							await client.emitMove("up");
							break;
						case "D":
							await client.emitMove("down");
							break;
						case "R":
							await client.emitMove("right");
							break;
						case "L":
							await client.emitMove("left");
							break;
					}

					// Pickup parcels
					await client.emitPickup();

					// Tell pal to switch intention
					var moveResponse = await client.emitAsk(me.multiAgent_palID, { type: "MSG_corridorSwitchIntention", content: JSON.stringify({ intention: me.stoppedIntention, moves: me.moves }) });

					me.moves = palMoves;
					me.pendingBumpRequest = false;
					console.log("PAL INTENTION SWITCH: " + palIntention);
					myAgent.push(palIntention);
					timedRestoreBumpOptionGenerationFlag();
					staleResolved = true;
					break;

				case "move":
					var myX = Math.round(me.x);
					var myY = Math.round(me.y);
					var myFreeCells = checkFreeAdjacentCells();
					while (myFreeCells.length == 0) {
						// Wait a movement duration
						await new Promise((res) => setTimeout(res, currentConfig.MOVEMENT_DURATION));
						myFreeCells = checkFreeAdjacentCells();
					}
					// Move
					switch (myFreeCells[0]) {
						case "U":
							await client.emitMove("up");
							break;
						case "D":
							await client.emitMove("down");
							break;
						case "R":
							await client.emitMove("right");
							break;
						case "L":
							await client.emitMove("left");
							break;
					}

					// Tell the pal I moved so he can move
					var moveResponse = await client.emitAsk(me.multiAgent_palID, { type: "MSG_corridorMoved", content: JSON.stringify({ moveToX: myX, moveToY: myY }) });
					break;
			}			
		}
		return true;
	}
}

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

/**
 * Plan class handling the "go_to" intention
 */
class BFSmove extends Plan {
	static isApplicableTo(go_to, x, y) {
		return go_to == "go_to";
	}

	async execute(go_to, x, y) {
		// Force pal agent as non-blocking to allow pal bumps (and parcel switch)
		let path = navigateBFS([Math.round(me.x), Math.round(me.y)], [x, y], true);

		// If no path applicable, then select another cell and go to explore (to not remain still)
		if (path == undefined) {
			path = navigateBFS([Math.round(me.x), Math.round(me.y)], distanceExplore(), true);
		}

		me.currentPath = path;
		me.initialPathXPosition = Math.round(me.x);
		me.initialPathYPosition = Math.round(me.y);
		me.initialPathTime = Date.now();

		if (path != undefined) {
			// TODO: controllare se rimuovere askPalPath (per switchare parcels vogliamo che gli agenti si incontrino)
			/*
			// Once I have computed the path, ask confirmation to Pal
			let response = await askPalPath({ path: path, x: Math.round(me.x), y: Math.round(me.y) });

			// If the pal disapproves my path (DUMB VERSION)
			if (response.outcome == false) {
				// Then search another path that do not includes the pal
				// Update Pal position
				me.multiAgent_palX = Math.round(response.myX);
				me.multiAgent_palY = Math.round(response.myY);

				// Compute a path without Pal
				path = navigateBFS([Math.round(me.x), Math.round(me.y)], [x, y], true);
			}
			*/
			let i = 0;
			while (i < path.length) {
				// If stopped then quit
				if (this.stopped) throw ["stopped"];

				// If there is a bump request in progress
				if (me.pendingBumpRequest) {
					// Pause the movement intent
					await new Promise((res) => setTimeout(res, currentConfig.MOVEMENT_DURATION / 2));
					continue;
				}

				let moved_horizontally = undefined;
				let moved_vertically = undefined;
				let pal_bump = false;

				if (path[i] == "R") {
					// Emit move only if the pal is not in my next position
					if (!(me.y == me.multiAgent_palY && me.x + 1 == me.multiAgent_palX)) {
						moved_horizontally = await client.emitMove("right");
					} else {
						// If the pal is in my next position LOG
						console.log("PAL RIGHT");
						pal_bump = true;
					}
				} else if (path[i] == "L") {
					if (!(me.y == me.multiAgent_palY && me.x - 1 == me.multiAgent_palX)) {
						moved_horizontally = await client.emitMove("left");
					} else {
						// If the pal is in my next position LOG
						console.log("PAL LEFT");
						pal_bump = true;
					}
				}

				// Check if agent is carrying parcels
				let carriedParcels = carryingParcels();

				// If moved horizontally
				if (moved_horizontally) {
					me.x = moved_horizontally.x;
					me.y = moved_horizontally.y;
					me.bumping = false;

					// And if agent is carrying parcels
					if (carriedParcels.length > 0) {
						// Increment the movement penalty (increase probability to go deliver)
						me.moves += 1;
					}
				}

				if (this.stopped) throw ["stopped"]; // if stopped then quit

				if (path[i] == "U") {
					if (!(me.y + 1 == me.multiAgent_palY && me.x == me.multiAgent_palX)) {
						moved_vertically = await client.emitMove("up");
					} else {
						// If the pal is in my next position LOG
						console.log("PAL UP");
						pal_bump = true;

						// Flag option generation
					}
				} else if (path[i] == "D") {
					if (!(me.y - 1 == me.multiAgent_palY && me.x == me.multiAgent_palX)) {
						moved_vertically = await client.emitMove("down");
					} else {
						// If the pal is in my next position LOG
						console.log("PAL DOWN");
						pal_bump = true;
					}
				}

				// If moved vertically
				if (moved_vertically) {
					me.x = moved_vertically.x;
					me.y = moved_vertically.y;
					me.bumping = false;

					// And if agent is carrying parcels
					if (carriedParcels.length > 0) {
						// Increment the movement penalty (increase probability to go deliver)
						me.moves += 1;
					}
				}

				// If stucked
				if (!moved_horizontally && !moved_vertically) {
					if (!pal_bump) {
						// I am bumping into someone else, so generate another option
						return true;
					}

					// Pause movement intention
					me.pendingBumpRequest = true;

					// Pause option generation
					me.pendingBumpOptionRequest = true;

					// Reset pal_bump
					pal_bump = false;

					// Remember that I am bumping into the pal
					me.bumping = true;

					// Wait a movement duration to avoid spamming
					await new Promise((res) => setTimeout(res, currentConfig.MOVEMENT_DURATION));

					if (me.id == AGENT2_ID) {
						// If I am AGENT 2, signal AGENT 1 that I am bumping against him
						let response = await askPalBump();
						if (response.outcome) {
							// Also AGENT 1 is bumping into me, so save my current intention
							me.stoppedIntention = myAgent.getCurrentIntention();
							// Stop my intention
							myAgent.stopCurrentIntention();
							throw ["stopped"];
							// And wait for AGENT 1 to begin stale management
						} else {
							// AGENT 1 is NOT bumping into me (for now)
							// do nothing
						}
					} else {
						// AGENT 1
						// If the pal is bumping into me
						if (me.stopMovementAction) {
							// Then save the current intention
							me.stopMovementAction = false;
							me.stoppedIntention = myAgent.getCurrentIntention();

							// Push new intention to resolve the corridor problem
							myAgent.stopCurrentIntention();
							myAgent.push(["corridor_resolve"]);

							// Stop this movement intention
							throw ["stopped"];
						}
					}

					// Restart movement intention
					me.pendingBumpRequest = false;

					// Restart option generation
					timedRestoreBumpOptionGenerationFlag();

					//throw 'stucked';
				} else if (me.x == x && me.y == y) {
					// this.log('target reached');
				}

				// If I actually moved
				if (!me.bumping) {
					// Consider next path position
					i++;
				}

				// After motion update the timestamp of the visited cells
				grafo.updateTimeMap();
			}
		}
		return true;
	}
}

async function askPalPath(message) {
	me.pendingOptionRequest = true;
	let response = await client.emitAsk(me.multiAgent_palID, { type: "MSG_pathSelection", content: JSON.stringify(message) });
	me.pendingOptionRequest = false;
	return response;
}

async function askPalBump(message) {
	let response = await client.emitAsk(me.multiAgent_palID, { type: "MSG_bumpRequest" });
	return response;
}

/**
 * Send to pal my updated position info
 */
async function sendPosition2Pal() {
	me.multiAgent_myMessageID = me.multiAgent_myMessageID + 1;
	await client.emitSay(me.multiAgent_palID, { type: "MSG_positionUpdate", content: JSON.stringify({ x: me.x, y: me.y, msgID: me.multiAgent_myMessageID }) });
}

/**
 * Compute the list of reachable spawn/delivery zones from the current agent's position, ignoring the pal agent collision (I want to BUMP into it to trigger an intention switch)
 * @returns {[Array, Array]} tile items containing [suitableSpawn, suitableDelivery]
 */
function searchSuitableCellsBFS() {
	let queue = new Queue();
	let explored = new Set();
	let suitableSpawn = [];
	let suitableDelivery = [];

	let initialNode = grafo.graphMap[Math.round(me.x)][Math.round(me.y)];

	if (initialNode == undefined) {
		return undefined;
	}

	// Add initial node to the queue
	queue.enqueue(initialNode);

	// Cycle until the queue is empty or a valid path has been found
	while (!queue.isEmpty()) {
		if (suitableSpawn.length > MAX_EXPLORABLE_SPAWN_CELLS) {
			break;
		}
		// Take the item from the queue
		let currentNode = queue.dequeue();

		let currentNodeId = currentNode.x + " " + currentNode.y;

		// If the node not has not been visited
		if (!explored.has(currentNodeId)) {
			// Visit it
			explored.add(currentNodeId);

			// If node is occupied not by my pal, ignore its neighbors
			if (grafo.agentsNearby != undefined && grafo.agentsNearby[currentNode.x][currentNode.y] == 1 && !(currentNode.x == Math.round(me.multiAgent_palX) && currentNode.y == Math.round(me.multiAgent_palY))) {
				continue;
			}

			// Check node type
			if (currentNode.type == 1) {
				// If spawn node, then add to suitable spawns
				suitableSpawn.push({ type: currentNode.type, x: currentNode.x, y: currentNode.y });
			} else if (currentNode.type == 2) {
				// If deliver node, then add to suitable deliveries
				suitableDelivery.push({ type: currentNode.type, x: currentNode.x, y: currentNode.y });
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

	return [suitableSpawn, suitableDelivery];
}

/**
 * Randomly select a cell to explore using the "distance" criterion (distant cells are more probable), if the ratio of spawn/non spawn cells is greater than SPAWN_NON_SPAWN_RATIO, consider also delivery zones. Otherwise, this means that the spawn zones are few, so consider only them.
 * @returns {[BigInt, BigInt]} coordinates of random selected cell using the "distance" criterion
 */
function distanceExplore() {
	let suitableCells = searchSuitableCellsBFS();
	// Check spawn/non spawn ratio, if larger than SPAWN_NON_SPAWN_RATIO
	if (grafo.gameMap.spawnZonesCounter / grafo.gameMap.nonSpawnZonesCounter > SPAWN_NON_SPAWN_RATIO) {
		// Consider also delivery zones for the explore
		let deliveryOrSpawn = Math.random();
		if (deliveryOrSpawn < DELIVERY_AREA_EXPLORE) {
			// Explore only deliveries zones
			suitableCells = suitableCells[1];
		} else {
			// Explore only spawning zones
			suitableCells = suitableCells[0];
		}
	} else {
		// Consider only spawning tiles for explore
		suitableCells = suitableCells[0];
	}

	// Recover all suitable tiles for explore (spawning)
	let totalDistance = 0;
	let randX = undefined;
	let randY = undefined;

	// Compute distances
	suitableCells.forEach((element) => {
		element.distance = distance({ x: me.x, y: me.y }, { x: element.x, y: element.y });
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
function timedExplore() {
	// Explore only spawning zones
	let suitableCells = searchSuitableCellsBFS()[0];
	let tmp = [];
	// Do not consider some specific cells
	for (let i = 0; i < suitableCells.length; i++) {
		// Ignore current agent cell
		if (suitableCells[i].x == Math.round(me.x) && suitableCells[i].y == Math.round(me.y)) {
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
		element.timestamp = now - grafo.gameMap.timeMap[element.x][element.y];
		element.distance = distance({ x: me.x, y: me.y }, { x: element.x, y: element.y });
		totalTime += element.timestamp;
	});

	// Normalize timestamp
	suitableCells.forEach((element) => {
		element.timestamp /= totalTime; // First normalization
		element.timestamp /= element.distance * element.distance * element.distance * element.distance + 1; // Penalize distant cells
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

	// If timed explore failed
	if (randX == undefined || randY == undefined) {
		// If this happens, select a random cell to explore based on distance
		return distanceExplore();
	}
	return [randX, randY];
}

/**
 * Compute path from initialPos to finalPos using BFS
 *
 * @param {[int, int]} initialPos
 * @param {[int, int]} finalPos
 * @param {Boolean} palNotBlocking - if false (default) -> pal is not considered a blocking entity, if true -> pal is it
 * @returns path or undefined if path not available
 */
function navigateBFS(initialPos, finalPos, palNotBlocking = false) {
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
			if (grafo.agentsNearby != undefined && grafo.agentsNearby[currentNode.x][currentNode.y] == 1) {
				// If the occupying agent is the pal

				if (palNotBlocking && currentNode.x == Math.round(me.multiAgent_palX) && currentNode.y == Math.round(me.multiAgent_palY)) {
					// then it is ok
					finalPath = path;
				} else {
					// otherwise it is another agent that i can't control
					finalPath = undefined;
				}
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

			// If node is occupied and it is not my pal, ignore its neighbors
			if (grafo.agentsNearby != undefined && grafo.agentsNearby[currentNode.x][currentNode.y] == 1 && !(palNotBlocking && currentNode.x == Math.round(me.multiAgent_palX) && currentNode.y == Math.round(me.multiAgent_palY))) {
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

	// If there exists a path from the initial to the final tile
	if (finalPath != undefined) {
		return finalPath;
	} else {
		//console.log("No path found to [" + finalPos[0] + "," + finalPos[1] + "]!");
		return undefined;
	}
}

/**
 * Compute the expected reward of delivering the currently carried parcels following a specific path
 * @param {Array} carriedParcels - list of parcels carried by me
 * @param {Array} path - path the agent will follow to deliver the parcels
 * @returns expected reward of delivering the currently carried following the provided path
 */
function expectedRewardOfCarriedParcels(carriedParcels, path) {
	let totalScore = 0;

	if (path == undefined) {
		return 0;
	}

	carriedParcels.forEach((parcel) => {
		totalScore += parcelScoreAfterMsPath(path, parcel.reward, Date.now());
	});
	return totalScore;
}

/**
 * Compute the expected reward of delivering the currently carried parcels plus a targeted parcel to pick up
 * @param {Array} carriedParcels - list of parcels carried by me
 * @param {{x:BigInt, y: BigInt, reward: BigInt, time:BigInt}} parcel2Pickup - targeted parcel to pick up
 * @returns list containing 0: expected reward of delivering the currently carried parcels and the targeted parcel to pick up, 1: length of path to pickup the parcel
 */
function expectedRewardCarriedAndPickup(carriedParcels, parcel2Pickup) {
	let pickUpReward = parcelCostReward(parcel2Pickup);

	// If we can reach the parcel to pickup
	//if (pickUpReward.pathToDeliver != Infinity && pickUpReward.pathToParcel != Infinity && pickUpReward != 0 && pickUpReward.pathToDeliver != undefined && pickUpReward.pathToParcel != undefined) {
	if (pickUpReward != 0 && pickUpReward.pathToDeliver != undefined && pickUpReward.pathToParcel != undefined) {
		// Compute expected reward for the carried parcels
		let totalScore = pickUpReward.expectedReward + expectedRewardOfCarriedParcels(carriedParcels, pickUpReward.pathToParcel.concat(pickUpReward.pathToDeliver));

		// Return the final expected score
		return [totalScore, pickUpReward.pathToParcel.length];
	} else {
		// Else no reward
		return [0, 0];
	}
}

/**
 * Return the list of parcels carried by me
 * @returns {Array} list of parcels carried by me
 */
function carryingParcels() {
	// Compute the set of parcels carried by me
	var carriedParcels = [];
	parcels.forEach((parcel) => {
		if (parcel.carriedBy == me.id) {
			carriedParcels.push(parcel);
		}
	});

	return carriedParcels;
}

/**
 * Generate all possible options, based on the current game state and configuration, perform option filtering and select the best possible option as current intention
 */
function optionsGeneration() {
	// If I have already a pending request to my pal
	if (me.pendingOptionRequest || me.pendingBumpOptionRequest) {
		// Then I must await his response
		return;
	}

	// Recover all the parcels I am carrying and the path to the nearest delivery
	let carriedParcels = carryingParcels();

	// Find path to the nearest delivery
	let pathNearestDelivery = nearestDeliveryFromHerePath(Math.round(me.x), Math.round(me.y));

	const options = [];
	for (const parcel of parcels.values()) {
		if (!parcel.carriedBy) {
			if (parcel.x == Math.round(me.x) && parcel.y == Math.round(me.y)) {
				// I am already in this position with this parcel, so I must pick it up
				options.push([
					"go_pick_up",
					parcel.x, // X coord
					parcel.y, // Y coord
					parcel.id, // ID
					Infinity, // Expected reward
					0, // Path length to pickup
				]);
			} else {
				// Compute and save the current expected reward for this parcel from the current agent's position
				let tmpReward = [];
				if (me.parcels2Ignore.has(parcel.id)) {
					tmpReward = [0, Infinity];
				} else {
					tmpReward = expectedRewardCarriedAndPickup(carriedParcels, parcel);
				}

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

async function askPalOption(message) {
	client
		.emitAsk(me.multiAgent_palID, { type: "MSG_optionSelection", content: JSON.stringify(message) })
		.then((response) => {
			if (response == true) {
				// If the pal is OK with my selection, then I push it to my intention
				myAgent.push(message);
				me.pendingOptionRequest = false; 
			} else {
				// If the pal is NOT OK with my selection, I must invalidate it
				switch (message[0]) {
					case "go_pick_up":
						// Add the parcel to the set of parcels to ignore
						me.parcels2Ignore.set(message[3], Date.now());
						me.pendingOptionRequest = false; 
						optionsGeneration();
						break;
					case "go_deliver":
						// TODO: dopo un po di tempo agente 1 risponde timeout e finisce qui
						console.log("Deliver refused somehow?!?");
						me.pendingOptionRequest = false; 
						break;
				}
			}
		})
		.catch((error) => {
			console.error("Error during askPalOption:", error);
		});
}

/**
 * Compute the expected reward of a specific parcel (go pick up and deliver)
 * @param {{x:BigInt, y: BigInt, reward: BigInt, time:BigInt}} parcel
 * @returns Map containing the path from the current agent position to the parcel (pathToParcel, undefined if not reachable), the path from the parcel to nearest delivery zone (pathToDeliver, undefined if not reachable) and expected reward (expectedReward)
 */
function parcelCostReward(parcel) {
	let parX = parcel.x;
	let parY = parcel.y;
	let parScore = parcel.reward;
	let lastVisitTime = parcel.time;

	// Compute distance agent -> parcel
	let pathToParcel = navigateBFS([Math.round(me.x), Math.round(me.y)], [parX, parY]);

	if (pathToParcel == undefined) {
		return {
			pathToParcel: undefined,
			pathToDeliver: undefined,
			expectedReward: 0,
		};
	}

	// Find path to the nearest delivery
	let pathToDeliver = nearestDeliveryFromHerePath(parX, parY);

	if (pathToDeliver == undefined) {
		return {
			pathToParcel: undefined,
			pathToDeliver: undefined,
			expectedReward: 0,
		};
	}

	// Compute expected reward for [parX, parY] parcel
	let expectedReward = parcelScoreAfterMsPath(pathToParcel.concat(pathToDeliver), parScore, lastVisitTime);

	// Increase the reward based on distance from parcel
	if (pathToParcel.length <= PARCEL_DISTANCE_LOW) {
		expectedReward = expectedReward * PARCEL_WEIGHT_LOW;
	} else if (pathToParcel.length <= PARCEL_DISTANCE_MID) {
		expectedReward = expectedReward * PARCEL_WEIGHT_MID;
	} else if (pathToParcel.length <= PARCEL_DISTANCE_HIGH) {
		expectedReward = expectedReward * PARCEL_WEIGHT_HIGH;
	}

	// Return paths a->p, p->d, expected reward
	return {
		pathToParcel: pathToParcel,
		pathToDeliver: pathToDeliver,
		expectedReward: expectedReward,
	};
}

/**
 * Compute the new score of a parcel after a specific time considering the specific map configuration and the last time the parcel was seen
 * @param {BigInt} time - time in milliseconds
 * @param {BigInt} parcelScore - current parcel score
 * @param {BigInt} lastVisitTime - timestamp of the parcel's last visit
 * @returns  the estimated score of the parcel after the provided time
 */
function parcelScoreAfterMs(time, parcelScore, lastVisitTime) {
	let decadeInterval = currentConfig.PARCEL_DECADING_INTERVAL; //Seconds

	// Convert decade interval to number (in currentConfig it is a string)
	if (decadeInterval == "infinite") {
		decadeInterval = Infinity;
	} else {
		decadeInterval = Number(decadeInterval.substring(0, decadeInterval.length - 1));
	}
	// Convert to ms
	decadeInterval *= 1000;

	// Add some additional time margin
	let marginedTime = time + Number(currentConfig.MOVEMENT_DURATION);
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
function parcelScoreAfterMsPath(path, parcelScore, lastVisitTime) {
	return parcelScoreAfterMs(path.length * currentConfig.MOVEMENT_DURATION, parcelScore, lastVisitTime);
}

/**
 * Compute a revision of the agent's memory regarding parcels and agents positions
 * @param {Boolean} generateOptions - if True, compute the option generation after the memory revision
 */
function reviseMemory(generateOptions) {
	let parcels2Ignore2 = new Map();
	let parcels2 = new Map();
	let agents2 = new Map();

	// Revise memory about parcels2Ignore
	me.parcels2Ignore.forEach((timestamp, id) => {
		// Check if I ignored the parcel recently
		if (Date.now() - timestamp < MEMORY_REVISION_PARCELS2IGNORE) {
			// If so, keep ignoring it
			parcels2Ignore2.set(id, timestamp);
		}
	});
	me.parcels2Ignore = parcels2Ignore2;

	// Revise memory information about parcels
	parcels.forEach((parcel) => {
		// Check if I see old parcels position
		if (distance({ x: parcel.x, y: parcel.y }, { x: me.x, y: me.y }) < currentConfig.PARCELS_OBSERVATION_DISTANCE) {
			// Check if I saw the parcel recently (aka. the onParcelsSensing was called by it)
			if (Date.now() - parcel.time < INVIEW_MEMORY_DIFFERENCE_THRESHOLD) {
				// If so, preserve it
				parcels2.set(parcel.id, parcel);
			}
		} else {
			// Check if I saw the parcel (not in our vision range) recently
			if (Date.now() - parcel.time < OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD) {
				// If so, preserve it
				parcels2.set(parcel.id, parcel);
			}
		}
	});
	parcels = parcels2;

	// Revise memory information about agents
	agents.forEach((agent) => {
		// Check if I see old agents position
		if (distance({ x: agent.x, y: agent.y }, { x: me.x, y: me.y }) < currentConfig.AGENTS_OBSERVATION_DISTANCE) {
			// Check if I saw the agent recently (aka. the onAgentSensing was called by it)
			if (Date.now() - agent.time < INVIEW_MEMORY_DIFFERENCE_THRESHOLD) {
				// If so, preserve it
				agents2.set(agent.id, agent);
			}
		} else {
			// Check if I saw the agent (not in our vision range) recently
			if (Date.now() - agent.time < OUTVIEW_MEMORY_DIFFERENCE_THRESHOLD) {
				// If so, preserve it
				agents2.set(agent.id, agent);
			}
		}
	});

	agents = agents2;

	grafo.resetAgentsNearby();

	// Add the agents to the matrix
	for (const a of agents) {
		if (grafo.agentsNearby != undefined) {
			grafo.agentsNearby[Math.round(a[1].x)][Math.round(a[1].y)] = 1;
		}
	}

	if (generateOptions) {
		optionsGeneration();
	}
}

/**
 * Compute the path to the nearest delivery cell from a given position considering also the other agents as blocking elements (the pal agent is NOT blocking)
 * @param {Number} x - starting x coordinate
 * @param {Number} y - starting y coordinate
 * @returns {Array} [0]: coordinates [finalX, finalY] of the nearest delivery (if non existing -> [undefined, undefined]); [1]: array containing path to nearest delivery from [x, y] cell (if non existing -> undefined)
 */
function nearestDeliveryFromHere(x, y) {
	let queue = new Queue();
	let explored = new Set();
	let finalPath = undefined;
	let finalX = undefined;
	let finalY = undefined;

	let initialNode = grafo.graphMap[x][y];

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
			if (grafo.agentsNearby != undefined && grafo.agentsNearby[currentNode.x][currentNode.y] == 1) {
				// If the occupying agent is the pal
				if (currentNode.x == Math.round(me.multiAgent_palX) && currentNode.y == Math.round(me.multiAgent_palY)) {
					// then it is ok
					finalPath = path;
					finalX = currentNode.x;
					finalY = currentNode.y;
					break;
				} else {
					// otherwise it is another agent that i can't control
					finalPath = undefined;
				}
			} else {
				// No agent
				finalPath = path;
				finalX = currentNode.x;
				finalY = currentNode.y;
				break;
			}
		}

		let currentNodeId = currentNode.x + " " + currentNode.y;

		// If the node not has not been visited
		if (!explored.has(currentNodeId)) {
			// Visit it
			explored.add(currentNodeId);

			// If node is occupied and it is not my pal, ignore its neighbors
			if (grafo.agentsNearby != undefined && grafo.agentsNearby[currentNode.x][currentNode.y] == 1 && !(currentNode.x == Math.round(me.multiAgent_palX) && currentNode.y == Math.round(me.multiAgent_palY))) {
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

	// If there exists a path from the initial to the final tile
	if (finalPath != undefined) {
		return [[finalX, finalY], finalPath];
	} else {
		//console.log("No path found to [" + finalPos[0] + "," + finalPos[1] + "]!");
		return [[undefined, undefined], undefined];
	}
}

/**
 * Compute the path to the nearest delivery cell from a given position considering also the other agents as blocking elements (the pal agent is NOT blocking)
 * @param {Number} x - starting x coordinate
 * @param {Number} y - starting y coordinate
 * @returns {Array} array containing path to nearest delivery from [x, y] cell (if non existing -> undefined)
 */
function nearestDeliveryFromHerePath(x, y) {
	return nearestDeliveryFromHere(x, y)[1];
}

/**
 * Compute the path to the nearest delivery cell from a given position considering also the other agents as blocking elements (the pal agent is NOT blocking)
 * @param {Number} x - starting x coordinate
 * @param {Number} y - starting y coordinate
 * @returns {Array} coordinates [finalX, finalY] of the nearest delivery (if non existing -> [undefined, undefined])
 */
function nearestDeliveryFromHereCoords(x, y) {
	return nearestDeliveryFromHere(x, y)[0];
}

/**
 * Check if the cells adjacents to me are free to walk to
 * @returns {Array} list containing directions of free cells (U, D, R, L), empty list if no free cells
 */
function checkFreeAdjacentCells() {
	let freeCells = [];

	// Check if cell UP is free
	if (grafo.graphMap[Math.round(me.x)][Math.round(me.y) + 1] != undefined && grafo.graphMap[Math.round(me.x)][Math.round(me.y) + 1].type != 0 && grafo.agentsNearby[Math.round(me.x)][Math.round(me.y) + 1] != 1) {
		freeCells.push("U");
	}
	// Check if cell DOWN is free
	if (grafo.graphMap[Math.round(me.x)][Math.round(me.y) - 1] != undefined && grafo.graphMap[Math.round(me.x)][Math.round(me.y) - 1].type != 0 && grafo.agentsNearby[Math.round(me.x)][Math.round(me.y) - 1] != 1) {
		freeCells.push("D");
	}
	// Check if cell RIGHT is free
	if (grafo.graphMap[Math.round(me.x) + 1][Math.round(me.y)] != undefined && grafo.graphMap[Math.round(me.x) + 1][Math.round(me.y)].type != 0 && grafo.agentsNearby[Math.round(me.x) + 1][Math.round(me.y)] != 1) {
		freeCells.push("R");
	}
	// Check if cell LEFT is free
	if (grafo.graphMap[Math.round(me.x) - 1][Math.round(me.y)] != undefined && grafo.graphMap[Math.round(me.x) - 1][Math.round(me.y)].type != 0 && grafo.agentsNearby[Math.round(me.x) - 1][Math.round(me.y)] != 1) {
		freeCells.push("L");
	}
	return freeCells;
}

/**
 * Wait some time and then restore the option generation flag
 */
async function timedRestoreBumpOptionGenerationFlag() {
	await new Promise((res) => setTimeout(res, currentConfig.MOVEMENT_DURATION * RESTORE_OPTION_GENERATION_SCALE_FACTOR));
	me.pendingBumpOptionRequest = false;
}

/**
 * Compute movement direction
 * @param {Number} x - direction x to move
 * @param {Number} y - direction y to move
 * @returns {String} direction to move
 */
function computeMovementDirection(x, y) {
	// Compute the movement direction
	let direction = undefined;
	if (x == Math.round(me.x)) {
		if (y > Math.round(me.y)) {
			direction = "U";
		} else {
			direction = "D";
		}
	} else {
		if (x > Math.round(me.x)) {
			direction = "R";
		} else {
			direction = "L";
		}
	}
	return direction;
}

function mapToJSON(map) {
	return JSON.stringify(Object.fromEntries(map));
}

function JSONToMap(json) {
	return new Map(Object.entries(JSON.parse(json)));
}

function matrixToJSON(mat) {
	return JSON.stringify(mat);
}

function JSONToMatrix(json) {
	return JSON.parse(json);
}

async function memoryRevisionLoop() {
	while (true) {
		await new Promise((res) => setTimeout(res, MEMORY_REVISION_TIMER));
		reviseMemory(false);
	}
}

async function memoryShareLoop() {
	while (true) {
		await new Promise((res) => setTimeout(res, MEMORY_SHARE_TIMER));

		// Send the parcels in the current belief set to the other agent in JSON format
		await client.emitSay(me.multiAgent_palID, {
			type: "MSG_parcelSensing",
			content: mapToJSON(parcels),
		});

		// Send the agents in the current belief set to the other agent in JSON format
		await client.emitSay(me.multiAgent_palID, {
			type: "MSG_agentSensing",
			content: mapToJSON(agents),
		});

		// Send the current me information to the other agent in JSON format
		if (me.x != null && me.y != null) {
			let map = new Map();
			map.set(me.id, { id: me.id, x: me.x, y: me.y });
			await client.emitSay(me.multiAgent_palID, {
				type: "MSG_agentInfo",
				content: mapToJSON(map),
			});
		}

		// Send the agents timestamp map to the other agent in JSON format
		await client.emitSay(me.multiAgent_palID, {
			type: "MSG_timeMap",
			content: matrixToJSON(grafo.gameMap.timeMap),
		});
	}
}

// ---------------------------------------------------------------------------------------------------------------
// ===============================================================================================================
// ---------------------------------------------------------------------------------------------------------------

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
planLibrary.push(BFSmove);
planLibrary.push(GoDeliver);
planLibrary.push(Explore);
planLibrary.push(CorridorResolve);

client.onMsg(async (id, name, msg, reply) => {
	var checkMemory = false;

	// Manage the message content based on the message type
	switch (msg.type) {
		case "MSG_parcelSensing":
			// Reconstruct parcel map
			let parcels_map = JSONToMap(msg.content);

			// Cycle all the reconstructed parcels
			parcels_map.forEach((p) => {
				// Check if the parcel is already in my memory
				if (parcels.has(p.id)) {
					// If so, check if the received parcel information is newer than the parcel information in my memory
					if (parcels.get(p.id).time < p.time) {
						// If so, update my memory
						parcels.set(p.id, p);
					}
				} else {
					// If not in memory, add it
					parcels.set(p.id, p);
				}
			});
			break;
		case "MSG_agentSensing":
			// Reconstruct agent map
			let agents_map = JSONToMap(msg.content);

			// Cycle all the reconstructed agents
			agents_map.forEach((a) => {
				// Check if the agent is already in my memory
				if (parcels.has(a.id)) {
					// If so, check if the received agent information is newer than the agent information in my memory
					if (agents.get(a.id).time < a.time) {
						// If so, update my memory
						agents.set(a.id, a);
					}
				} else {
					// If not in memory, add it if that agent is no me
					if (me.id != a.id) {
						agents.set(a.id, a);
					}
				}
			});
			break;

		case "MSG_agentInfo":
			// Reconstruct other agent map
			let agent_map = JSONToMap(msg.content).get(me.multiAgent_palID);
			me.multiAgent_palX = Math.round(agent_map.x);
			me.multiAgent_palY = Math.round(agent_map.y);

			agent_map.time = Date.now();
			// Add other agent to my memory
			agents.set(agent_map.id, agent_map);
			break;

		case "MSG_timeMap":
			// Reconstruct other agent time map
			let time_map = JSONToMatrix(msg.content);
			grafo.mergeTimeMaps(time_map);
			break;

		case "MSG_carryingPKG":
			// Reconstruct the parcels carried by the pal
			let carriedParcels = JSON.parse(msg.content);
			carriedParcels.forEach((p) => {
				parcels.set(p.id, p);
			});

			// Schedule a revise memory
			checkMemory = true;
			break;

		case "MSG_optionSelection":
			let palOption = JSON.parse(msg.content);
			if (reply) {
				switch (palOption[0]) {
					case "go_pick_up":
						console.log(palOption);

						// Check if I should refuse that pickup action
						let currentIntention = myAgent.getCurrentIntention();

						console.log(currentIntention);

						// If I have some intention and I am picking up that parcel with higher reward
						if (currentIntention != undefined && currentIntention[0] == "go_pick_up" && currentIntention[3] == palOption[3] && currentIntention[4] > palOption[4]) {
							// This parcel is MINE
							reply(false);
						} else {
							// The pal can have that parcel
							reply(true);
						}
						break;
					case "go_deliver":
						// I have no reason to refuse a deliver
						reply(true);
						break;
				}
			}
			break;

		case "MSG_pathSelection":
			let tmp = JSON.parse(msg.content);
			let palPath = tmp.path;
			me.multiAgent_palX = Math.round(tmp.x);
			me.multiAgent_palY = Math.round(tmp.y);
			let tmpPalX = tmp.x;
			let tmpPalY = tmp.y;
			let tmpMyX = me.initialPathXPosition;
			let tmpMyY = me.initialPathYPosition;

			let nowTimestamp = Date.now();

			// Compute position+time sequence of Pal
			let palSequence = [];
			let tmpTimeStamp = nowTimestamp;
			palPath.forEach((move) => {
				tmpTimeStamp += currentConfig.MOVEMENT_DURATION;
				switch (move) {
					case "U":
						tmpPalY += 1;
						break;
					case "R":
						tmpPalX += 1;
						break;
					case "D":
						tmpPalY -= 1;
						break;
					case "L":
						tmpPalX -= 1;
						break;
				}
				palSequence.push({ x: tmpPalX, y: tmpPalY, timestamp: tmpTimeStamp });
			});

			// Compute position+time sequence of Me
			let mySequence = [];
			let myTimeStamp = nowTimestamp;
			let currentPositionReached = false;

			// If my path is undefined, there is no risk in bumping with pal
			if (me.currentPath == undefined) {
				// So, reply with true
				reply({ outcome: true });
				break;
			}

			me.currentPath.forEach((move) => {
				if (tmpMyX == Math.round(me.x) && tmpMyY == Math.round(me.y)) {
					currentPositionReached = true;
				}
				switch (move) {
					case "U":
						tmpMyY += 1;
						break;
					case "R":
						tmpMyX += 1;
						break;
					case "D":
						tmpMyY -= 1;
						break;
					case "L":
						tmpMyX -= 1;
						break;
				}

				if (currentPositionReached) {
					myTimeStamp += currentConfig.MOVEMENT_DURATION;
					mySequence.push({ x: tmpMyX, y: tmpMyY, timestamp: myTimeStamp });
				}
			});

			// Compare sequences and search for bumps
			let minLen = Math.min(mySequence.length, palSequence.length);
			for (let i = 0; i < minLen; i++) {
				if (mySequence[i].x == palSequence[i].x && mySequence[i].y == palSequence[i].y) {
					// Then we are bumping somewhere, so replay considering what I am currently doing (dumb version: return always false)
					let currentIntention = undefined;
					if (myAgent.getCurrentIntention()) {
						currentIntention = myAgent.getCurrentIntention()[0];
					}

					switch (currentIntention) {
						case "go_pick_up":
						case "go_deliver":
						case "explore":
						default:
							reply({ outcome: false, myX: Math.round(me.x), myY: Math.round(me.y) });
							break;
					}
				}
			}

			// If we are here, we are not bumping, then the path is ok
			reply({ outcome: true });
			break;

		case "MSG_positionUpdate":
			// Recover message content
			let palX = JSON.parse(msg.content).x;
			let palY = JSON.parse(msg.content).y;
			let palID = JSON.parse(msg.content).msgID;

			// Verify message validity
			if (me.multiAgent_palMessageID < palID) {
				me.multiAgent_palMessageID = palID;
				me.multiAgent_palX = Math.round(palX);
				me.multiAgent_palY = Math.round(palY);
			}
			break;

		case "MSG_bumpRequest":
			// Check if I am also bumping against the pal
			if (me.bumping) {
				me.stopMovementAction = true;
				reply({ outcome: true });
			} else {
				reply({ outcome: false });
			}

			break;

		case "MSG_corridor_initialState":

			for(var i = 0; i < 10; i++){
				console.log("MSG_corridor_initialState: " + JSON.parse(msg.content));
				console.log("intent: " + JSON.parse(msg.content).intention);
			}

			var palIntention = JSON.parse(msg.content).intention;
			let palParcelsNo = JSON.parse(msg.content).parcelsNo;
			let palFreeCells = JSON.parse(msg.content).freeCells;
			var myIntention = me.stoppedIntention;
			let myParcelsNo = carryingParcels().length;
			let myAdjacentCells = checkFreeAdjacentCells();

			// If no one has parcels, just switch intentions
			if (palParcelsNo == 0 && myParcelsNo == 0) {
				reply({ outcome: "switch_intention", content: myIntention });

				// Restart movement intention
				me.pendingBumpRequest = false;
				myAgent.push(palIntention);

				// Restart option generation
				timedRestoreBumpOptionGenerationFlag();

				// If only the pal is carrying parcels
			} else if (palParcelsNo > 0 && myParcelsNo == 0) {
				// Check if pal has space to move
				if (palFreeCells.length > 0) {
					// Tell him to drop parcels and move
					reply({ outcome: "drop_and_move", content: myIntention });
				} else {
					// I fI have no free cells to move at the m
					while(myAdjacentCells.length == 0){
						await new Promise((res) => setTimeout(res, currentConfig.MOVEMENT_DURATION / 2));
					}
					if (myAdjacentCells.length > 0) {
						// If so, then move

						let myX = Math.round(me.x);
						let myY = Math.round(me.y);

						switch (myAdjacentCells[0]) {
							case "U":
								await client.emitMove("up");
								break;
							case "D":
								await client.emitMove("down");
								break;
							case "R":
								await client.emitMove("right");
								break;
							case "L":
								await client.emitMove("left");
								break;
						}

						// Tell him to move
						reply({ outcome: "gain_space", moveToX: myX, moveToY: myY });
					}
				}

				// If only I am carrying parcels
			} else if (palParcelsNo == 0 && myParcelsNo > 0) {
				// Check if I have space to move
				if (myAdjacentCells.length > 0) {
					// If so, drop parcels and move
					await client.emitPutdown();
					let myX = Math.round(me.x);
					let myY = Math.round(me.y);

					// Compute movement
					switch (myAdjacentCells[0]) {
							case "U":
								await client.emitMove("up");
								break;
							case "D":
								await client.emitMove("down");
								break;
							case "R":
								await client.emitMove("right");
								break;
							case "L":
								await client.emitMove("left");
								break;
						}

					// Tell him to move to get parcels
					reply({ outcome: "move_and_pickup", intention: myIntention, moves: me.moves, moveToX: myX, moveToY: myY });
				} else {
					// Tell him to move
					reply({ outcome: "move" });
				}

				// Both have parcels
			} else {
				// Check if my intention is to go deliver
				if (myIntention[0] == "go_deliver") {
					// Check if I have space to move
					if (myAdjacentCells.length > 0) {
						// If so, drop parcels and move
						await client.emitPutdown();
						let myX = Math.round(me.x);
						let myY = Math.round(me.y);

						// Compute movement
						switch (myAdjacentCells[0]) {
							case "U":
								await client.emitMove("up");
								break;
							case "D":
								await client.emitMove("down");
								break;
							case "R":
								await client.emitMove("right");
								break;
							case "L":
								await client.emitMove("left");
								break;
						}

						// Tell him to move to get parcels
						reply({ outcome: "move_and_pickup", intention: myIntention, moves: me.moves, moveToX: myX, moveToY: myY });
					} else {
						// Tell him to move
						reply({ outcome: "move" });
					}
				} else if (palIntention == "go_deliver") {
					// Check if pal has space to move
					if (palFreeCells.length > 0) {
						// Tell him to drop parcels and move
						reply({ outcome: "drop_and_move", content: myIntention });
					} else {
						// Check if I have space to move
						if (myAdjacentCells.length > 0) {
							// If so, then move

							let myX = Math.round(me.x);
							let myY = Math.round(me.y);

							// Compute movement
							switch (myAdjacentCells[0]) {
							case "U":
								await client.emitMove("up");
								break;
							case "D":
								await client.emitMove("down");
								break;
							case "R":
								await client.emitMove("right");
								break;
							case "L":
								await client.emitMove("left");
								break;
						}

							// Tell him to move
							reply({ outcome: "gain_space", moveToX: myX, moveToY: myY });
						}
					}
				}
			}
			break;
		case "MSG_corridorMoved":
			var moveToX = JSON.parse(msg.content).moveToX;
			var moveToY = JSON.parse(msg.content).moveToY;
			var direction = computeMovementDirection(moveToX, moveToY);

			// Move to direction and tell the pal
			let tmpResponse;
			switch (direction) {
				case "U":
					tmpResponse = await client.emitMove("up");
					break;
				case "D":
					tmpResponse = await client.emitMove("down");
					break;
				case "R":
					tmpResponse = await client.emitMove("right");
					break;
				case "L":
					tmpResponse = await client.emitMove("left");
					break;
				default:
					tmpResponse = false;
					break;
			}
			reply({ outcome: tmpResponse });
			break;
		case "MSG_corridorMovePickupIntention":
			var palIntention = JSON.parse(msg.content).intention;
			var palMoves = JSON.parse(msg.content).moves;
			var myIntention = me.stoppedIntention;
			var moveToX = JSON.parse(msg.content).moveToX;
			var moveToY = JSON.parse(msg.content).moveToY;

			// Move
			switch (computeMovementDirection(moveToX, moveToY)) {
				case "U":
					await client.emitMove("up");
					break;
				case "D":
					await client.emitMove("down");
					break;
				case "R":
					await client.emitMove("right");
					break;
				case "L":
					await client.emitMove("left");
					break;
			}

			// Pickup
			await client.emitPickup();

			// Switch intention
			let myMoves = me.moves;
			me.moves = palMoves;

			me.pendingBumpRequest = false;
			myAgent.push(palIntention);
			timedRestoreBumpOptionGenerationFlag();

			// Reply
			reply({ outcome: true, content: myIntention, moves: myMoves });
			break;
		case "MSG_corridorSwitchIntention":
			var palIntention = JSON.parse(msg.content).intentions;
			var palMoves = JSON.parse(msg.content).moves;

			me.moves = palMoves;

			me.pendingBumpRequest = false;
			myAgent.push(palIntention);
			timedRestoreBumpOptionGenerationFlag();

			reply({ outcome: true });

		default:
			break;
	}
	reviseMemory(checkMemory);

	/* 	if (reply) {
		let answer = "hello " + name + ", this is the reply from " + myname + ". Do you need anything?";
		console.log("my reply: ", answer);
		try {
			reply(answer);
		} catch {
			(error) => console.error(error);
		}
	} */
});



client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);

myAgent.loop();

memoryRevisionLoop();

memoryShareLoop();
