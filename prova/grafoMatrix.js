import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    // 'https://deliveroojs25.azurewebsites.net',
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjJjOTQyMSIsIm5hbWUiOiJtYXJjbyIsInRlYW1JZCI6IjViMTVkMSIsInRlYW1OYW1lIjoiZGlzaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQyNTY3NDE4fQ.5m8St0OZo_DCXCriYkLtsguOm1e20-IAN2JNgXL7iUQ'
    //'https://deliveroojs2.rtibdi.disi.unitn.it/',
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImQyNmQ1NyIsIm5hbWUiOiJtYXJjbyIsInRlYW1JZCI6ImM3ZjgwMCIsInRlYW1OYW1lIjoiZGlzaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQwMDA3NjIwfQ.1lfKRxSSwj3_a4fWnAV44U1koLrphwLkZ9yZnYQDoSw'
    'http://localhost:8080'
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


class Mappa{
    constructor(width, height, tile){
        // Take map in deliveroo format and convert it into matrix format
        this.map = [];
        this.delivery_cells = [];
        this.spawn_cells = [];
        this.walkable_cells = [];
        this.closest_delivery_cell = [];
        this.closest_spawn_cell = [];

        for (let i = 0; i < width; i++) {
            this.map[i] = [];
            for (let j = 0; j < height; j++) {
                this.map[i].push(tile[i + width*j])
                if(this.map[i][j].type == 2) {
                    this.delivery_cells.push(this.map[i][j])
                }
                if(this.map[i][j].type == 1) {
                    this.spawn_cells.push(this.map[i][j])
                }
                if(this.map[i][j].type != 0) {
                    this.walkable_cells.push(this.map[i][j])
                }
            }
        }
    
        for (let i = 0; i < width; i++) {
            this.closest_delivery_cell[i] = [];
            this.closest_spawn_cell[i] = [];
            for (let j = 0; j < height; j++) {
                
            }
        }
    }

    preProcess(){
        // Pre process the map to add nearest deliver zone and nearest spawn point
        // Add delivery cells to queue

    }
}

var currentMappa = 0

client.onMap( (width, height, tile) => {
    currentMappa = new Mappa(width, height, tile);
})