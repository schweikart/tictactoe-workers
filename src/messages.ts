/**
 * The structure of any message sent to the WebSocket server.
 */
export interface Message {
    /**
     * Specifies which type of message this is. Used to determine the further structure of the message.
     */
    type: string;
}

/**
 * A move message is sent to the server when a player selects a field they want to color.
 */
export interface MoveMessage extends Message {
    type: 'move';
    /**
     * The row index of the field to color.
     */
    row: number;
    /**
     * The column index of the field to color.
     */
    col: number;
}

/**
 * A reset message is sent to the server to trigger a game reset.
 */
export interface ResetMessage extends Message {
    type: 'reset';
};

/**
 * An error message is sent to the client if an error occurs that the client is involved in.
 */
export interface ErrorMessage extends Message {
    type: 'error';
    /**
     * A descripion description of the error.
     */
    message: string;
}