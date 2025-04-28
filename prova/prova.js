import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    // 'https://deliveroojs25.azurewebsites.net',
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjJjOTQyMSIsIm5hbWUiOiJtYXJjbyIsInRlYW1JZCI6IjViMTVkMSIsInRlYW1OYW1lIjoiZGlzaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQyNTY3NDE4fQ.5m8St0OZo_DCXCriYkLtsguOm1e20-IAN2JNgXL7iUQ'
    //'https://deliveroojs2.rtibdi.disi.unitn.it/',
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImQyNmQ1NyIsIm5hbWUiOiJtYXJjbyIsInRlYW1JZCI6ImM3ZjgwMCIsInRlYW1OYW1lIjoiZGlzaSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQwMDA3NjIwfQ.1lfKRxSSwj3_a4fWnAV44U1koLrphwLkZ9yZnYQDoSw'
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjdmMzMxMCIsIm5hbWUiOiJwcm92YSIsInRlYW1JZCI6IjYyZmQwNCIsInRlYW1OYW1lIjoidGVhbSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzQ1ODIyNDAwfQ.KR5jRXJIuVo5LnM0JRJjTihfBymefwLMapNxmnR1Jb8'
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

var map = [];
var delivery_cells = [];
var spawn_cells = [];
var walkable_cells = [];
var closest_delivery_cell = [];
var closest_spawn_cell = [];

client.onMap( (width, height, tile) => {

    for (let i = 0; i < width; i++) {
        map[i] = [];
        for (let j = 0; j < height; j++) {
            map[i].push(tile[i + width*j])
            if(map[i][j].type == 2) {
                delivery_cells.push(map[i][j])
            }
            if(map[i][j].type == 1) {
                spawn_cells.push(map[i][j])
            }
            if(map[i][j].type != 0) {
                walkable_cells.push(map[i][j])
            }
        }
    }

    for (let i = 0; i < width; i++) {
        closest_delivery_cell[i] = [];
        closest_spawn_cell[i] = [];
        for (let j = 0; j < height; j++) {
            
        }
    }
    
    console.log("ENTIRE MAP")
    for (let i = width - 1; i >= 0; i--) {
        var row = ""
        for (let j = 0; j < height; j++) {
            row = row + map[i][j].type + " "
        }
        console.log(row + "\n")
    }

    console.log("DELIVERY CELLS")
    console.log(delivery_cells)
    console.log("SPAWN CELLS")
    console.log(spawn_cells)
    console.log("WALKABLE CELLS")
    console.log(walkable_cells)

})