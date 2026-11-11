// Minimal RCON client for a Factorio server. Ported from clock-generator (MIT), src/harness/rcon.ts.
// Factorio answers every packet with exactly one packet, however long, so commands are sent one at a time and each
// waits for its answer.
import net from "node:net";

const PACKET_AUTH = 3;
const PACKET_COMMAND = 2;

export class RconClient {
    /** @param {net.Socket} socket */
    constructor(socket) {
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        this.nextId = 1;
        /** @type {{ id: number, resolve: (body: string) => void, reject: (error: Error) => void } | null} */
        this.waiting = null;
        /** @type {Promise<unknown>} */
        this.queue = Promise.resolve();
        socket.on("data", chunk => this.onData(chunk));
        socket.on("error", error => this.fail(error));
        socket.on("close", () => this.fail(new Error("RCON connection closed")));
    }

    /** @returns {Promise<RconClient>} */
    static async connect(port, password, host = "127.0.0.1") {
        const socket = await new Promise((resolve, reject) => {
            const connecting = net.createConnection({ host, port }, () => resolve(connecting));
            connecting.once("error", reject);
        });
        const client = new RconClient(socket);
        await client.send(PACKET_AUTH, password);
        return client;
    }

    /**
     * Run a console command and return what it printed with rcon.print
     * @param {string} command
     * @returns {Promise<string>}
     */
    command(command) {
        const result = this.queue.then(() => this.send(PACKET_COMMAND, command));
        this.queue = result.catch(() => undefined);
        return result;
    }

    close() {
        this.socket.destroy();
    }

    send(type, body) {
        const id = this.nextId++;
        const payload = Buffer.from(body, "utf8");
        const packet = Buffer.alloc(14 + payload.length);
        packet.writeInt32LE(10 + payload.length, 0);
        packet.writeInt32LE(id, 4);
        packet.writeInt32LE(type, 8);
        payload.copy(packet, 12);
        return new Promise((resolve, reject) => {
            this.waiting = { id, resolve, reject };
            this.socket.write(packet);
        });
    }

    onData(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 4) {
            const size = this.buffer.readInt32LE(0);
            if (this.buffer.length < 4 + size) return;
            const id = this.buffer.readInt32LE(4);
            const body = this.buffer.toString("utf8", 12, 4 + size - 2);
            this.buffer = this.buffer.subarray(4 + size);
            const waiting = this.waiting;
            this.waiting = null;
            if (!waiting) continue;
            if (id === -1) waiting.reject(new Error("RCON password rejected"));
            else waiting.resolve(body);
        }
    }

    fail(error) {
        const waiting = this.waiting;
        this.waiting = null;
        waiting?.reject(error);
    }
}
