import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    // 'https://deliveroojs25.azurewebsites.net',
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjJjOTQyMSIsIm5hbWUiOiJtYXJjbyIsInRlYW1JZCI6IjViMTVkMSIsInRlYW1OYW1lIjoiZGlzaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQyNTY3NDE4fQ.5m8St0OZo_DCXCriYkLtsguOm1e20-IAN2JNgXL7iUQ'
    //'https://deliveroojs2.rtibdi.disi.unitn.it/',
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImQyNmQ1NyIsIm5hbWUiOiJtYXJjbyIsInRlYW1JZCI6ImM3ZjgwMCIsInRlYW1OYW1lIjoiZGlzaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQwMDA3NjIwfQ.1lfKRxSSwj3_a4fWnAV44U1koLrphwLkZ9yZnYQDoSw'
    'http://localhost:8080', 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNkNjU1NCIsIm5hbWUiOiJBZ2VudCIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ2MDE4MzU1fQ.Qj5XIXCpnxv4ibSukP8xL0oTz6X6v7_3ouKZiVBHJl8"
)

const me = {id: null, name: null, x: null, y: null, score: null};

client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
} )

function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
}

class Queue {
    constructor() {
        this.items = [];
        this.head = 0;
        this.tail = 0;
    }

    enqueue(item) {
        this.items[this.tail++] = item;
    }

    dequeue() {
        if (this.isEmpty()) return undefined;
        const item = this.items[this.head];
        delete this.items[this.head];
        this.head++;
        return item;
    }

    isEmpty() {
        return this.head === this.tail;
    }

    size() {
        return this.tail - this.head;
    }
}

class GraphNode{
    constructor(type, x, y){
        this.x = x;
        this.y = y;
        this.neighU = undefined;
        this.neighR = undefined;
        this.neighD = undefined;
        this.neighL = undefined;
        this.type = type;
        this.visitedDeliveries = []; // List of dictionaries containing {deliveryNode, distance, direction}
        this.nearestSpawn = undefined;  // Nearest spawn area
        this.visitedSet = new Set() // Set containing the delivery nodes that already visited this node
    }
}

class Graph{
    constructor(currentMap){
        this.gameMap = currentMap;
        this.graphMap = [];
        
        // Create graph nodes and save them into a matrix
        for(let x=0; x < this.gameMap.width; x++){
            this.graphMap[x]=[];
            for(let y=0; y < this.gameMap.height; y++){
                if(this.gameMap.getItem(x, y)==0){
                    this.graphMap[x][y] = null;
                } else {
                    this.graphMap[x][y] = new GraphNode(this.gameMap.getItem(x, y), x, y);
                }                
            }
        }

        // Connect each graph node to its neighbors
        for(let x=0; x < this.gameMap.width; x++){
            for(let y=0; y < this.gameMap.height; y++){
                if(this.graphMap[x][y]!=null){

                    // if neighbor in bound
                    if(0<=y+1 && y+1 < this.gameMap.height){
                        // if neighbor walkable
                        if(this.graphMap[x][y+1]!=null){
                            // add up neighbor
                            this.graphMap[x][y].neighU = this.graphMap[x][y+1];
                        }
                    }

                    // if neighbor in bound
                    if(0<=x+1 && x+1 < this.gameMap.width){
                        // if neighbor walkable
                        if(this.graphMap[x+1][y]!=null){
                            // add right neighbor
                            this.graphMap[x][y].neighR = this.graphMap[x+1][y];
                        }
                    }

                    // if neighbor in bound
                    if(0<=y-1 && y-1 < this.gameMap.height){
                        // if neighbor walkable
                        if(this.graphMap[x][y-1]!=null){
                            // add down neighbor
                            this.graphMap[x][y].neighD = this.graphMap[x][y-1];
                        }
                    }

                    // if neighbor in bound
                    if(0<=x-1 && x-1 < this.gameMap.width){
                        // if neighbor walkable
                        if(this.graphMap[x-1][y]!=null){
                            // add left neighbor
                            this.graphMap[x][y].neighL = this.graphMap[x-1][y];
                        }
                    }
                }
            }
        }

        /*
        for (let i = this.gameMap.width - 1; i >= 0; i--) {
            for (let j = 0; j < this.gameMap.height; j++) {
                if(this.graphMap[i][j] == null){
                    console.log("[" + i + "][" + j + "]=0");
                } else {
                    console.log("[" + i + "][" + j + "]");
                        if(this.graphMap[i][j].neighU == null){
                            console.log("U=0")
                        } else {
                            console.log("U=[" + this.graphMap[i][j].neighU.x + "][" + this.graphMap[i][j].neighU.y + "]");
                        }
                        if(this.graphMap[i][j].neighR == null){
                            console.log("R=0")
                        } else {
                            console.log("R=[" + this.graphMap[i][j].neighR.x + "][" + this.graphMap[i][j].neighR.y + "]");
                        }
                        if(this.graphMap[i][j].neighD == null){
                            console.log("D=0")
                        } else {
                            console.log("D=[" + this.graphMap[i][j].neighD.x + "][" + this.graphMap[i][j].neighD.y + "]");
                        }
                        if(this.graphMap[i][j].neighL == null){
                            console.log("L=0")
                        } else {
                            console.log("L=[" + this.graphMap[i][j].neighL.x + "][" + this.graphMap[i][j].neighL.y + "]");
                        }
                }
                console.log("\n----------------------\n")                
            }
        }*/

        this.preprocess();

        console.log("DONE");

        /*
        let X = 34;
        let Y = 32;
        let node = this.graphMap[X][Y];
        while(true) {
            if(node.type == 2) {
                console.log("ARRIVATO");
                break;
            }
            let delivery = node.visitedDeliveries[0];
            //node.visitedDeliveries.forEach(element => {
            //    console.log(element.distance)
            //})
            console.log("DELIVERY: [" + delivery.deliveryNode.x + ", " + delivery.deliveryNode.y + "], " + delivery.direction + ", " + delivery.distance);
            if(delivery.direction == "U") {
                node = node.neighU;
            }
            else if(delivery.direction == "R") {
                node = node.neighR;
            }
            else if(delivery.direction == "D") {
                node = node.neighD;
            }
            else if(delivery.direction == "L") {
                node = node.neighL;
            }
        }
        */
    }

    // Compute nearest delivery/spawn
    preprocess(){
        // Compute nearest delivery
        let queue = new Queue();
        this.gameMap.deliveryZones.forEach(element => {

            // Insert delivery zones in the queue
            // Current: current node that we are exploring
            // Source: source delivery zone
            // Distance: distance from the source node
            // Direction: direction to reach the source
            queue.enqueue({current: this.graphMap[element.x][element.y], source: this.graphMap[element.x][element.y], distance: 0, direction: null});

            while (!queue.isEmpty()) {
                let { current, source, distance, direction } = queue.dequeue();
        
                let sourceId = source.x + " " + source.y;
                // If the node not has not been visited
                if (!current.visitedSet.has(sourceId)) {
                    // Visit it
                    current.visitedSet.add(sourceId)
                    current.visitedDeliveries.push({deliveryNode: source, distance: distance, direction: direction});

                    // Explore its neighbors
                    // Up
                    if(current.neighU != null) {
                        queue.enqueue({current: current.neighU, source: source, distance: distance + 1, direction: "D"});
                    }

                    // Right
                    if(current.neighR != null) {
                        queue.enqueue({current: current.neighR, source: source, distance: distance + 1, direction: "L"});
                    }

                    // Down
                    if(current.neighD != null) {
                        queue.enqueue({current: current.neighD, source: source, distance: distance + 1, direction: "U"});
                    }

                    // Left
                    if(current.neighL != null) {
                        queue.enqueue({current: current.neighL, source: source, distance: distance + 1, direction: "R"});
                    }
                }
            }
        });

        // Sort the deliveries on the distance for each node
        this.graphMap.forEach(row => {
            row.forEach(element => {
                if(element) {
                    element.visitedDeliveries.sort( (first, second) => {return first.distance - second.distance});
                }
            })
        })
    }
}

class GameMap{
    constructor(width, height, tile){
        // Take map in deliveroo format and convert it into matrix format
        this.width = width;
        this.height = height;
        this.map = [];
        this.deliveryZones = [];
        this.spawnZones = [];

        for (let i = 0; i < width; i++) {
            this.map[i] = [];
        }

        for(let i = 0; i < (width*height); i++){
            let currentItem = tile[i];
            this.map[currentItem.x][currentItem.y]=currentItem.type;

            if(currentItem.type == 1){
                // Spawn zone
                this.spawnZones.push(currentItem);
            } else if (currentItem.type == 2){
                // Delivery zone
                this.deliveryZones.push(currentItem);
            }
        }
    }

    getItem(x, y){
        return this.map[x][y];
    }
}

var currentMap = undefined;
var grafo = undefined;
var currentConfig = undefined;

await new Promise( res => {

    // Get the map information
    client.onMap( (width, height, tile) => {
        currentMap = new GameMap(width, height, tile);
        grafo = new Graph(currentMap);
        res();
    });

    // Get the configuration
    client.onConfig(config => {
        currentConfig = config;
        res();
    });
});

//**********************************************************************/


// Parcels belief set
const parcels = new Map();

client.onParcelsSensing( async ( pp ) => {

    // Add the sensed parcels to the parcel belief set
    for (const p of pp) {
        parcels.set( p.id, p);
        //console.log("Parcel id: " + p.id + ", reward: " + p.reward + ", x: " + p.x+ ", y: " + p.y);
    }
    //console.log("------------------------");

    // DA MODIFICARE
    for ( const p of parcels.values() ) {
        if ( pp.map( p => p.id ).find( id => id == p.id ) == undefined ) {
            parcels.delete( p.id );
        }
    }
});

client.onParcelsSensing( optionsGeneration )
client.onAgentsSensing( optionsGeneration )
client.onYou( optionsGeneration )

function navigateBFS (initialPos, finalPos) {
    
    let queue = new Queue();
    let explored = new Set();
    let finalPath = undefined;

    let initialNode = grafo.graphMap[initialPos[0]][initialPos[1]];

    if(initialNode==undefined){
        return undefined;
    }

    // Add initial node to the queue
    queue.enqueue({currentNode: initialNode, path: []});

    // Cycle until the queue is empty or a valid path has been found
    while (!queue.isEmpty()) {

        // Take the item from the queue
        let {currentNode, path} = queue.dequeue();

        // If the current position is the final position return the path
        if(currentNode.x == finalPos[0] && currentNode.y == finalPos[1]){
            finalPath = path;
            break;
        }

        let currentNodeId = currentNode.x + " " + currentNode.y;

        // If the node not has not been visited
        if (!explored.has(currentNodeId)) {

            // Visit it
            explored.add(currentNodeId);

            // Explore its neighbors
            // Up
            if(currentNode.neighU != null) {
                let tmp = path.slice();
                tmp.push("U");
                queue.enqueue({currentNode: currentNode.neighU, path: tmp});
                //console.log("U");
            }

            // Right
            if(currentNode.neighR != null) {
                let tmp = path.slice();
                tmp.push("R");
                queue.enqueue({currentNode: currentNode.neighR, path: tmp});
                //console.log("R");
            }

            // Down
            if(currentNode.neighD != null) {
                let tmp = path.slice();
                tmp.push("D");
                queue.enqueue({currentNode: currentNode.neighD, path: tmp});
                //console.log("D");
            }

            // Left
            if(currentNode.neighL != null) {
                let tmp = path.slice();
                tmp.push("L");
                queue.enqueue({currentNode: currentNode.neighL, path: tmp});
                //console.log("L");
            }
            //console.log("------------------");
        }
    }

    // If there exists a path from the initial to the final tile
    if(finalPath != undefined) {
        return finalPath;
    } else {
        console.log("No path found!");
        return undefined;
    }
}

function optionsGeneration () {

    // TODO revisit beliefset revision so to trigger option generation only in the case a new parcel is observed

    /**
     * Options generation
     */
    const options = []
    for (const parcel of parcels.values()){
        if ( !parcel.carriedBy ){
            options.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] );
            // myAgent.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] )
        } else if (parcel.carriedBy == me.id){
            options.push( [ 'go_deliver' ] );
        }
    }
        
            
    /**
     * Options filtering
     */
    let best_option;
    let nearest = Number.MAX_VALUE;
    for (const option of options) {
        if ( option[0] == 'go_pick_up' ) {
            let [go_pick_up,x,y,id] = option;
            let current_d = navigateBFS([Math.round(me.x), Math.round(me.y)], [x,y]);
            if(current_d!=undefined){
                current_d=current_d.length;
                if ( current_d < nearest ) {
                    best_option = option
                    nearest = current_d
                }
            }            
        } else if (option[0] == "go_deliver"){
            best_option = option;
            break;
        }
    }

    /**
     * Best option is selected
     */
    if ( best_option )
        //console.log(best_option[1] + " "+ best_option[2])
        myAgent.push( best_option )

}

/**
 * Intention revision loop
 */
class IntentionRevision {

    #intention_queue = new Array();
    get intention_queue () {
        return this.#intention_queue;
    }

    async loop ( ) {
        while ( true ) {
            // Consumes intention_queue if not empty
            if ( this.intention_queue.length > 0 ) {
                console.log( 'intentionRevision.loop', this.intention_queue.map(i=>i.predicate) );
            
                // Current intention
                const intention = this.intention_queue[0];
                
                // Is queued intention still valid? Do I still want to achieve it?
                // TODO this hard-coded implementation is an example
                let id = intention.predicate[2]
                let p = parcels.get(id)
                if ( p && p.carriedBy ) {
                    console.log( 'Skipping intention because no more valid', intention.predicate )
                    continue;
                }

                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch( error => {
                    // console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
                } );

                // Remove from the queue
                this.intention_queue.shift();
            }
            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    // async push ( predicate ) { }

    log ( ...args ) {
        console.log( ...args )
    }

}

class IntentionRevisionReplace extends IntentionRevision {

    async push ( predicate ) {

        // Check if already queued
        const last = this.intention_queue.at( this.intention_queue.length - 1 );
        if ( last && last.predicate.join(' ') == predicate.join(' ') ) {
            return; // intention is already being achieved
        }
        
        console.log( 'IntentionRevisionReplace.push', predicate );
        const intention = new Intention( this, predicate );
        this.intention_queue.push( intention );
        
        // Force current intention stop 
        if ( last ) {
            last.stop();
        }
    }

}

const myAgent = new IntentionRevisionReplace();
myAgent.loop();


/**
 * Intention
 */
class Intention {

    // Plan currently used for achieving the intention 
    #current_plan;
    
    // This is used to stop the intention
    #stopped = false;
    get stopped () {
        return this.#stopped;
    }
    stop () {
        // this.log( 'stop intention', ...this.#predicate );
        this.#stopped = true;
        if ( this.#current_plan)
            this.#current_plan.stop();
    }

    /**
     * #parent refers to caller
     */
    #parent;

    /**
     * @type { any[] } predicate is in the form ['go_to', x, y]
     */
    get predicate () {
        return this.#predicate;
    }
    /**
     * @type { any[] } predicate is in the form ['go_to', x, y]
     */
    #predicate;

    constructor ( parent, predicate ) {
        this.#parent = parent;
        this.#predicate = predicate;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    #started = false;
    /**
     * Using the plan library to achieve an intention
     */
    async achieve () {
        // Cannot start twice
        if ( this.#started)
            return this;
        else
            this.#started = true;

        // Trying all plans in the library
        for (const planClass of planLibrary) {

            // if stopped then quit
            if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

            // if plan is 'statically' applicable
            if ( planClass.isApplicableTo( ...this.predicate ) ) {
                // plan is instantiated
                this.#current_plan = new planClass(this.#parent);
                this.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute( ...this.predicate );
                    this.log( 'successful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res );
                    return plan_res
                // or errors are caught so to continue with next plan
                } catch (error) {
                    this.log( 'failed intention', ...this.predicate,'with plan', planClass.name, 'with error:', error );
                }
            }

        }

        // if stopped then quit
        if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

        // no plans have been found to satisfy the intention
        // this.log( 'no plan satisfied the intention ', ...this.predicate );
        throw ['no plan satisfied the intention ', ...this.predicate ]
    }
}

/**
 * Plan library
 */
const planLibrary = [];

class Plan {

    // This is used to stop the plan
    #stopped = false;
    stop () {
        // this.log( 'stop plan' );
        this.#stopped = true;
        for ( const i of this.#sub_intentions ) {
            i.stop();
        }
    }
    get stopped () {
        return this.#stopped;
    }

    /**
     * #parent refers to caller
     */
    #parent;

    constructor ( parent ) {
        this.#parent = parent;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
    #sub_intentions = [];

    async subIntention ( predicate ) {
        const sub_intention = new Intention( this, predicate );
        this.#sub_intentions.push( sub_intention );
        return sub_intention.achieve();
    }

}

class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y, id ) {
        return go_pick_up == 'go_pick_up';
    }

    async execute ( go_pick_up, x, y ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await this.subIntention( ['go_to', x, y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await client.emitPickup()
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class GoDeliver extends Plan {

    static isApplicableTo (go_deliver) {
        return go_deliver == 'go_deliver';
    }

    async execute (go_deliver) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit

        let nearestDelivery = (grafo.graphMap[Math.round(me.x)][Math.round(me.y)]).visitedDeliveries[0].deliveryNode;
        
        await this.subIntention( ['go_to', nearestDelivery.x, nearestDelivery.y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await client.emitPutdown();
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class BlindBFSmove extends Plan {

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to';
    }

    async execute ( go_to, x, y ) {
        let path = navigateBFS([Math.round(me.x), Math.round(me.y)], [x,y]);

        let i = 0;
        while ( i < path.length ) {

            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            let moved_horizontally;
            let moved_vertically;
            
            // this.log('me', me, 'xy', x, y);

            if ( path[i]=="R" )
                moved_horizontally = await client.emitMove('right')
                // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
            else if ( path[i]=="L" )
                moved_horizontally = await client.emitMove('left')
                // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );

            if (moved_horizontally) {
                me.x = moved_horizontally.x;
                me.y = moved_horizontally.y;
            }

            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            if ( path[i]=="U" )
                moved_vertically = await client.emitMove('up')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
            else if ( path[i]=="D" )
                moved_vertically = await client.emitMove('down')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

            if (moved_vertically) {
                me.x = moved_vertically.x;
                me.y = moved_vertically.y;
            }
            
            if ( ! moved_horizontally && ! moved_vertically) {
                this.log('stucked');
                throw 'stucked';
            } else if ( me.x == x && me.y == y ) {
                // this.log('target reached');
            }

            i++;
            
        }

        return true;

    }
}

// plan classes are added to plan library 
planLibrary.push( GoPickUp )
planLibrary.push( BlindBFSmove )
planLibrary.push( GoDeliver )