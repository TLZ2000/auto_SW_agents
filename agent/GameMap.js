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

		for (let i = 0; i < width; i++) {
			this.map[i] = [];
		}

		for (let i = 0; i < width * height; i++) {
			let currentItem = tile[i];
			this.map[currentItem.x][currentItem.y] = currentItem;
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
				if (!valid) {
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
	#graph_map = null;

	/**
	 * @param {BigInt} width - map width
	 * @param {BigInt} height - map height
	 * @param {Array<Map>} tile - array containing the type of cells formatted as {x, y, type}
	 */
	constructor(width, height, tile) {
		this.#raw = new RawMap(width, height, tile); // Representation of the raw map information
		this.#graph_map = [];

		// Create graph nodes and save them into a matrix
		for (let x = 0; x < this.#raw.width; x++) {
			this.#graph_map[x] = [];
			for (let y = 0; y < this.#raw.height; y++) {
				if (this.#raw.getItem(x, y) == 0) {
					this.#graph_map[x][y] = null;
				} else {
					this.#graph_map[x][y] = new GraphNode(this.#raw.getItem(x, y), x, y);
				}
			}
		}

		// Connect each graph node to its neighbors
		for (let x = 0; x < this.#raw.width; x++) {
			for (let y = 0; y < this.#raw.height; y++) {
				if (this.#graph_map[x][y] != null) {
					// if neighbor in bound
					if (0 <= y + 1 && y + 1 < this.#raw.height) {
						// if neighbor walkable
						if (this.#graph_map[x][y + 1] != null) {
							// add up neighbor
							this.#graph_map[x][y].neighU = this.#graph_map[x][y + 1];
						}
					}

					// if neighbor in bound
					if (0 <= x + 1 && x + 1 < this.#raw.width) {
						// if neighbor walkable
						if (this.#graph_map[x + 1][y] != null) {
							// add right neighbor
							this.#graph_map[x][y].neighR = this.#graph_map[x + 1][y];
						}
					}

					// if neighbor in bound
					if (0 <= y - 1 && y - 1 < this.#raw.height) {
						// if neighbor walkable
						if (this.#graph_map[x][y - 1] != null) {
							// add down neighbor
							this.#graph_map[x][y].neighD = this.#graph_map[x][y - 1];
						}
					}

					// if neighbor in bound
					if (0 <= x - 1 && x - 1 < this.#raw.width) {
						// if neighbor walkable
						if (this.#graph_map[x - 1][y] != null) {
							// add left neighbor
							this.#graph_map[x][y].neighL = this.#graph_map[x - 1][y];
						}
					}
				}
			}
		}
	}

	/**
	 * Get a specific graph node
	 * @param {BigInt} x
	 * @param {BigInt} y
	 * @returns graphNode in position [x,y]
	 */
	getGraphNode(x, y) {
		if (x != null && y != null) {
			return this.#graph_map[x][y];
		}
		console.log("NULLED", x, y);
		return null;
	}

	/**
	 * Get a specific item of the raw map
	 * @param {BigInt} x
	 * @param {BigInt} y
	 * @returns item in position [x,y]
	 */
	getItem(x, y) {
		return this.#raw.getItem(x, y);
	}

	getWidth() {
		return this.#raw.width;
	}

	getHeight() {
		return this.#raw.height;
	}
}
