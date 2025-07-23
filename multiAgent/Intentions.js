/**
 * Base IntentionRevision class
 */
class IntentionRevision {
	#current_intention = null;
	#next_intention = null;
	#plan_library = [];

	async loop() {
		while (true) {
			// Consumes current_intention if not empty
			if (this.#current_intention != null) {
				console.log("intentionRevision.loop", this.#current_intention.predicate);

				const intention = this.#current_intention;

				// Start achieving intention
				await intention
					.achieve(this.#plan_library)
					// Catch eventual error and continue
					.catch((error) => {
						// console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
					});
			}
			// Replace the current_intention with the next_intention and clear the next_intention
			this.#current_intention = this.#next_intention;
			this.#next_intention = null;

			// Postpone next iteration at setImmediate
			await new Promise((res) => setImmediate(res));
		}
	}

	log(...args) {
		console.log(...args);
	}

	addPlan(plan) {
		this.#plan_library.push(plan);
	}

	getPlanLibrary() {
		return this.#plan_library;
	}

	setNextIntention(intention) {
		this.#next_intention = intention;
	}

	getNextIntention() {
		return this.#next_intention;
	}

	getCurrentIntention() {
		return this.#current_intention;
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
		throw ["no plan satisfied the intention ", ...this.predicate];
	}
}

/**
 * Implementation of the IntentionRevision class considering only a single current intention
 */
export class IntentionRevisionReplace extends IntentionRevision {
	async push(predicate) {
		// Get the next intention
		let last = this.getNextIntention();

		if (last == null) {
			// If the next intention is null, get the current intention
			last = this.getCurrentIntention();
		}

		// Check if I want to push the same intention
		if (last && areIntentionsEqual(last.predicate, predicate)) {
			// If so, avoid the push
			return;
		}

		// Otherwise, create the intention and push it
		console.log("IntentionRevisionReplace.push", predicate);
		const intention = new Intention(this, predicate);
		this.setNextIntention(intention);

		// Force intention stop
		if (last) {
			last.stop();
		}
	}

	// Function to get the current intention predicate
	getCurrentIntentionPredicate() {
		if (this.getCurrentIntention()) {
			return this.getCurrentIntention().predicate;
		}
		return undefined;
	}
}

/**
 * Base Plan class
 * @param {Array} intention1
 * @param {Array} intention2
 * @returns true if the intentions are considered equal, false otherwise
 */
function areIntentionsEqual(intention1, intention2) {
	if (intention1[0] == intention2[0]) {
		switch (intention1[0]) {
			case "explore":
				// If the name of the intentions are equal, it is sufficient
				return true;
			case "share_parcels":
				// If the name of the intentions are equal, it is sufficient
				return true;
			case "recover_shared_parcels":
				// If the name of the intentions are equal, it is sufficient
				return true;
			case "go_to":
				// If the go_to is to the same position, the intentions are equal
				return intention1[1] == intention2[1] && intention1[2] == intention2[2];
			case "go_pick_up":
				// If the parcel to pickup is to the same position, the intentions are equal
				return intention1[1] == intention2[1] && intention1[2] == intention2[2];
			case "follow_path":
				// If the path to follow is the same, the intentions are equal
				return intention1[1].join(" ") == intention2[1].join(" ");
			case "go_deliver":
				// If the path to follow is the same, the intentions are equal
				return intention1[2].join(" ") == intention2[2].join(" ");
		}
	}
	return false;
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
