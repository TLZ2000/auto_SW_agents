/**
 * Base IntentionRevision class
 */

class IntentionRevision {
	#intention_queue = new Array();
	#plan_library = [];
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

				// Start achieving intention
				await intention
					.achieve(this.#plan_library)
					// Catch eventual error and continue
					.catch((error) => {
						// console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
					});

				// Remove from the queue
				//this.intention_queue.shift();
				this.#intention_queue = new Array();
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

	addPlan(plan) {
		this.#plan_library.push(plan);
	}

	getPlanLibrary() {
		return this.#plan_library;
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
	async achieve(planLibrary) {
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
 * Implementation of the IntentionRevision class considering only a single current intention
 */
export class IntentionRevisionReplace extends IntentionRevision {
	async push(predicate) {
		// Check if already queued
		// const last = this.intention_queue[0];
		const last = this.intention_queue.at(this.intention_queue.length - 1);

		if (last && last.predicate.join(" ") == predicate.join(" ")) {
			return; // intention is already being achieved
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
}

/**
 * Base Plan class
 */
export class Plan {
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

	async subIntention(predicate, planLibrary) {
		const sub_intention = new Intention(this, predicate);
		this.#sub_intentions.push(sub_intention);
		return sub_intention.achieve(planLibrary);
	}
}
