import { GameMap } from "./GameMap.js";

export class BeliefSet {
    #game_map = null;
    #agent_memory = null;
    #parcel_memory = null;
    #me_memory = null;
    #pal_memory = null;


    constructor() {
		
	}

    instantiateGameMap(width, height, tile){
        this.#game_map = new GameMap(width, height, tile);
    }

    printRaw(){
        this.#game_map.printRaw()
    }
}