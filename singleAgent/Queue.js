export class Queue {
    #items = [];
    #head = 0;
    #tail = 0;

	constructor() {
		this.#items = [];
		this.#head = 0;
		this.#tail = 0;
	}

	/**
	 * Enqueue the specific item
	 * @param {*} item - item to enqueue
	 */
	enqueue(item) {
		this.#items[this.#tail++] = item;
	}

	/**
	 * Remove the first item from the queue and return it
	 * @returns popped item from the queue
	 */
	dequeue() {
		if (this.isEmpty()) return undefined;
		const item = this.#items[this.#head];
		delete this.#items[this.#head];
		this.#head++;
		return item;
	}

	/**
	 * Whether the queue is empty or not
	 * @returns
	 */
	isEmpty() {
		return this.#head === this.#tail;
	}

	/**
	 * Current size of the queue
	 * @returns
	 */
	size() {
		return this.#tail - this.#head;
	}
}