import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { BeliefSet } from "./BeliefSet.js";

// TODO: spostare in belief
const AGENT1_ID = "a6cdae";
const AGENT2_ID = "ff8ff0";

const AGENT1_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE2Y2RhZSIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnNfMSIsInRlYW1JZCI6ImM1MTFhNCIsInRlYW1OYW1lIjoiVGhlIFJvYm9TYXBpZW5zIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDgzNTk4NTF9.ESkRP2T4LIP4z2ghpnmKFb-xkXldwNhaR2VShlL0dm4";
const AGENT2_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZmOGZmMCIsIm5hbWUiOiJUaGUgUm9ib1NhcGllbnNfMiIsInRlYW1JZCI6ImMzZTljYSIsInRlYW1OYW1lIjoiVGhlIFJvYm9TYXBpZW5zIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDgzNTk4NTV9.OOBVcCXkUxyLwY8OyDo6v8hfHiijKcAI2MRvOsrFJmA";
const SERVER_ADDRS = "http://localhost:8080";

const client = new DeliverooApi(SERVER_ADDRS, AGENT1_TOKEN);
const belief = new BeliefSet();

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
		currentConfig = config;
		res();
	});
});
