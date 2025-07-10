/**
 * Node item that will represent the single map cells
 */
class GraphNode {
	/**
	 * @param {BigInt} type - type of the cell the node will represent
	 * @param {BigInt} x - x coordinate of the cell the node will represent
	 * @param {BigInt} y - y coordinate of the cell the node will represent
	 */
	constructor(type, x, y) {
		this.x = x; // x position of the cell
		this.y = y; // y position of the cell
		this.type = type; // Node type
		this.neighU = undefined; // Up neighbor
		this.neighR = undefined; // Right neighbor
		this.neighD = undefined; // Down neighbor
		this.neighL = undefined; // Left neighbor
	}
}

/**
 * RawMap class that represent the first map info from the server
 */
class RawMap {
	/**
	 * Create an internal representation of the current map provided by the server
	 * @param {BigInt} width - map width
	 * @param {BigInt} height - map height
	 * @param {Array<Map>} tile - array containing the type of cells formatted as {x, y, type}
	 */
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

	/**
	 * Get a specific cell's type using a coordinate system where [0, 0] is the bottom left corner
	 * @param {BigInt} x
	 * @param {BigInt} y
	 * @returns {Map} return specifications of the cell formatted as {x, y, type}
	 */
	getItem(x, y) {
		return this.map[x][y];
	}
}

/**
 * Graph class used to manage the map navigation
 */
export class GameMap {
	#raw = null;
	#graphMap = null;
	#agentsNearby = null;

	/**
	 * @param {BigInt} width - map width
	 * @param {BigInt} height - map height
	 * @param {Array<Map>} tile - array containing the type of cells formatted as {x, y, type}
	 */
	constructor(width, height, tile) {
		this.#raw = new RawMap(width, height, tile); // Representation of the raw map information
		this.#graphMap = [];
		this.#agentsNearby = [];

		// Initialize matrix containing all the agents positions (0 -> no agent, 1 -> agent)
		for (let x = 0; x < this.#raw.width; x++) {
			this.#agentsNearby[x] = [];
			for (let y = 0; y < this.#raw.height; y++) {
				this.#agentsNearby[x][y] = 0;
			}
		}

		// Create graph nodes and save them into a matrix
		for (let x = 0; x < this.#raw.width; x++) {
			this.#graphMap[x] = [];
			for (let y = 0; y < this.#raw.height; y++) {
				if (this.#raw.getItem(x, y) == 0) {
					this.#graphMap[x][y] = null;
				} else {
					this.#graphMap[x][y] = new GraphNode(this.#raw.getItem(x, y), x, y);
				}
			}
		}

		// Connect each graph node to its neighbors
		for (let x = 0; x < this.#raw.width; x++) {
			for (let y = 0; y < this.#raw.height; y++) {
				if (this.#graphMap[x][y] != null) {
					// if neighbor in bound
					if (0 <= y + 1 && y + 1 < this.#raw.height) {
						// if neighbor walkable
						if (this.#graphMap[x][y + 1] != null) {
							// add up neighbor
							this.#graphMap[x][y].neighU = this.#graphMap[x][y + 1];
						}
					}

					// if neighbor in bound
					if (0 <= x + 1 && x + 1 < this.#raw.width) {
						// if neighbor walkable
						if (this.#graphMap[x + 1][y] != null) {
							// add right neighbor
							this.#graphMap[x][y].neighR = this.#graphMap[x + 1][y];
						}
					}

					// if neighbor in bound
					if (0 <= y - 1 && y - 1 < this.#raw.height) {
						// if neighbor walkable
						if (this.#graphMap[x][y - 1] != null) {
							// add down neighbor
							this.#graphMap[x][y].neighD = this.#graphMap[x][y - 1];
						}
					}

					// if neighbor in bound
					if (0 <= x - 1 && x - 1 < this.#raw.width) {
						// if neighbor walkable
						if (this.#graphMap[x - 1][y] != null) {
							// add left neighbor
							this.#graphMap[x][y].neighL = this.#graphMap[x - 1][y];
						}
					}
				}
			}
		}
	}

	/**
	 * Print raw map info, for testing
	 */
	printRaw() {
		for (let y = this.#raw.height - 1; y >= 0; y--) {
			let row = "";
			for (let x = 0; x < this.#raw.width; x++) {
				row = row + " " + this.#raw.getItem(x, y);
			}
			console.log(row);
		}
	}

	/**
	 * Compute Manhattan distance between two positions
	 * @param {Number} x1 - x of the first position to consider
	 * @param {Number} y1 - y of the first position to consider
	 * @param {Number} x2 - x of the second position to consider
	 * @param {Number} y2 - y of the second position to consider
	 * @returns {BigInt} Manhattan distance between pos1 and pos2
	 */
	distance(x1, y1, x2, y2) {
		const dx = Math.abs(Math.round(x1) - Math.round(x2));
		const dy = Math.abs(Math.round(y1) - Math.round(y2));
		return dx + dy;
	}

	/**
	 * Update the timestamp of the last visit for the visible cells at the agent's current location
	 */
	updateTimeMap() {
		let x = Math.round(me.x);
		let y = Math.round(me.y);
		let range = currentConfig.PARCELS_OBSERVATION_DISTANCE;
		let currentNode = this.#graphMap[x][y];
		let time = Date.now();

		this.#recursiveTimeMap(currentNode, time, range);
	}

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

	/**
	 * Reset the internal map that represent the cells occupied by other agents (to 0, completely free)
	 */
	resetAgentsNearby() {
		// Initialize matrix containing all the agents positions (0 -> no agent, 1 -> agent)
		for (let x = 0; x < this.#raw.width; x++) {
			this.#agentsNearby[x] = [];
			for (let y = 0; y < this.#raw.height; y++) {
				this.#agentsNearby[x][y] = 0;
			}
		}
	}

	/**
	 * PRIVATE FUNCTION, recursively explore the graph to update the "visited" time stamp
	 * @param {GraphNode} node - currently explored node
	 * @param {BigInt} time - current timestamp to set
	 * @param {BigInt} remainingRange - remaining vision range
	 */
	#recursiveTimeMap(node, time, remainingRange) {
		// If not node already explored (same timestamp) and remaining range
		if (this.#raw.timeMap[node.x][node.y] != time && remainingRange > 0) {
			// Explore it
			this.#raw.timeMap[node.x][node.y] = time;
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
