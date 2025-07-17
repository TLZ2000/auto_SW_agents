import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const MEMORY_REVISION_TIMER = 10000;
const MEMORY_SHARE_TIMER = 1500;
const MEMORY_REVISION_PARCELS2IGNORE = 5000;
const RESTORE_OPTION_GENERATION_SCALE_FACTOR = 8;

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

		while (!staleResolved) {
			if (this.stopped) throw ["stopped"]; // if stopped then quit

			console.log("SENDING: " + JSON.stringify({ intention: me.stoppedIntention, parcelsNo: carryingParcels().length, freeCells: checkFreeAdjacentCells() }));

			let response = await client.emitAsk(me.multiAgent_palID, { type: "MSG_corridor_initialState", content: JSON.stringify({ intention: me.stoppedIntention, parcelsNo: carryingParcels().length, freeCells: checkFreeAdjacentCells() }) });

			for (var i = 0; i < 10; i++) {
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

					console.log("GAIN SPACE TO: " + computeMovementDirection(moveToX, moveToY));

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

async function askPalBump(message) {
	let response = await client.emitAsk(me.multiAgent_palID, { type: "MSG_bumpRequest" });
	return response;
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

function matrixToJSON(mat) {
	return JSON.stringify(mat);
}

function JSONToMatrix(json) {
	return JSON.parse(json);
}

// ---------------------------------------------------------------------------------------------------------------
// ===============================================================================================================
// ---------------------------------------------------------------------------------------------------------------

var currentMap = undefined;
var grafo = undefined;
var currentConfig = undefined;

// Plan classes are added to plan library
planLibrary.push(CorridorResolve);

client.onMsg(async (id, name, msg, reply) => {
	var checkMemory = false;

	// Manage the message content based on the message type
	switch (msg.type) {
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
			for (var i = 0; i < 10; i++) {
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
					while (myAdjacentCells.length == 0) {
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

memoryRevisionLoop();

memoryShareLoop();
