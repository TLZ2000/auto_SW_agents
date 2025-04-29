import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    // 'https://deliveroojs25.azurewebsites.net',
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjJjOTQyMSIsIm5hbWUiOiJtYXJjbyIsInRlYW1JZCI6IjViMTVkMSIsInRlYW1OYW1lIjoiZGlzaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQyNTY3NDE4fQ.5m8St0OZo_DCXCriYkLtsguOm1e20-IAN2JNgXL7iUQ'
    //'https://deliveroojs2.rtibdi.disi.unitn.it/',
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImQyNmQ1NyIsIm5hbWUiOiJtYXJjbyIsInRlYW1JZCI6ImM3ZjgwMCIsInRlYW1OYW1lIjoiZGlzaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQwMDA3NjIwfQ.1lfKRxSSwj3_a4fWnAV44U1koLrphwLkZ9yZnYQDoSw'
    'http://localhost:8080', 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImI5OGY4NyIsIm5hbWUiOiJBZ2VudCIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ1OTEzMjgzfQ.fO8zWZQNHmMP1ULrkH11xE6u9aUHGSin1OO-_fgqaiY"
)

function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
}

const me = {id: null, name: null, x: null, y: null, score: null};

client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
} )

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
        this.nearestDelivery = [];      // List of nearest delivery areas
        this.nearestSpawn = undefined;  // Nearest spawn area
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
                    this.graphMap[x][y] = undefined;
                } else {
                    this.graphMap[x][y] = new GraphNode(this.gameMap.getItem(x, y), x, y);
                }                
            }
        }

        // Connect each graph node to its neighbors
        for(let x=0; x < this.gameMap.width; x++){
            for(let y=0; y < this.gameMap.height; y++){
                if(this.graphMap[x][y]!=undefined){
                    // if neighbor in bound
                    if(0<=y+1 && y+1 < this.gameMap.height){
                        // if neighbor walkable
                        if(this.graphMap[x][y+1]!=undefined){
                            // add up neighbor
                            this.graphMap[x][y].neighU = this.graphMap[x][y+1];
                        }
                    }

                    // if neighbor in bound
                    if(0<=x+1 && x+1 < this.gameMap.width){
                        // if neighbor walkable
                        if(this.graphMap[x+1][y]!=undefined){
                            // add right neighbor
                            this.graphMap[x][y].neighR = this.graphMap[x+1][y];
                        }
                    }

                    // if neighbor in bound
                    if(0<=y-1 && y-1 < this.gameMap.height){
                        // if neighbor walkable
                        if(this.graphMap[x][y-1]!=undefined){
                            // add down neighbor
                            this.graphMap[x][y].neighD = this.graphMap[x][y-1];
                        }
                    }

                    // if neighbor in bound
                    if(0<=x-1 && x-1 < this.gameMap.width){
                        // if neighbor walkable
                        if(this.graphMap[x-1][y]!=undefined){
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
                if(this.graphMap[i][j] == undefined){
                    console.log("[" + i + "][" + j + "]=0");
                } else {
                    console.log("[" + i + "][" + j + "]");
                        if(this.graphMap[i][j].neighU == undefined){
                            console.log("U=0")
                        } else {
                            console.log("U=[" + this.graphMap[i][j].neighU.x + "][" + this.graphMap[i][j].neighU.y + "]");
                        }
                        if(this.graphMap[i][j].neighR == undefined){
                            console.log("R=0")
                        } else {
                            console.log("R=[" + this.graphMap[i][j].neighR.x + "][" + this.graphMap[i][j].neighR.y + "]");
                        }
                        if(this.graphMap[i][j].neighD == undefined){
                            console.log("D=0")
                        } else {
                            console.log("D=[" + this.graphMap[i][j].neighD.x + "][" + this.graphMap[i][j].neighD.y + "]");
                        }
                        if(this.graphMap[i][j].neighL == undefined){
                            console.log("L=0")
                        } else {
                            console.log("L=[" + this.graphMap[i][j].neighL.x + "][" + this.graphMap[i][j].neighL.y + "]");
                        }
                }
                console.log("\n----------------------\n")                
            }
        }*/
       console.log("DONE")
    }

    // Compute nearest delivery/spawn
    preprocess(){
        // Compute nearest delivery
        let queue = new Queue();
        this.gameMap.deliveryZones.array.forEach(element => {
            // Check all delivery zones
            queue.enqueue(element);

            // Set local delivery zones
            this.graphMap[element.x][element.y].nearestDelivery.push({x:element.x, y:element.y});
        });
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

var currentMap = 0

client.onMap( (width, height, tile) => {
    currentMap = new GameMap(width, height, tile);
    let grafo = new Graph(currentMap);
})