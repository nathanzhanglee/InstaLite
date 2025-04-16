import fs from 'fs';
import mysql from 'mysql2/promise';
import process from 'process';

// Simple approach to determine config file path
const configPath = fs.existsSync('./config/config.json') 
  ? './config/config.json'           // Running from backend folder
  : 'backend/config/config.json';    // Running from root folder
const configFile = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configFile);

// Dotenv reads the .env file and makes the environment variables available
import dotenv from 'dotenv';
dotenv.config()

/**
 * Implementation of a singleton pattern for database connections
 */

var the_db = null;


class RelationalDB {
    conn = null;
    dbconfig = null;

    constructor() {
        this.dbconfig = config.database;
        if (process.env.DATABASE_USER) {
            this.dbconfig.host = process.env.DATABASE_SERVER;
            this.dbconfig.database = process.env.DATABASE_NAME;
            this.dbconfig.user = process.env.DATABASE_USER;
            this.dbconfig.password = process.env.DATABASE_PASSWORD;
        }
    }

    async connect() {
        if (this.conn != null) 
            return this;

        console.log("New connection request");
        // Connect to MySQL
        var conn = await mysql.createConnection(this.dbconfig);
        if (this.conn == null) {
            console.log("New connection used");
            this.conn = conn;
        } else {
            console.log("New connection discarded");
            conn.close();
        }

        return this;
    }

    /**
     * Gracefully close the database connection and deallocate the main object
     */
    close() {
        this.conn.end();
        this.conn = null;
        the_db = null;
    }

    /**
     * Sends an SQL query to the database
     * 
     * @param {*} query 
     * @param {*} params 
     * @returns promise
     */
    async send_sql(sql, params = []) {
        // console.log(sql, params);
        return this.conn.query(sql, params);
    }


    /**
     * Sends an SQL CREATE TABLES to the database
     * 
     * @param {*} query 
     * @param {*} params 
     * @returns promise
     */
    async create_tables(query, params = []) {
        return this.send_sql(query, params);
    }


    /**
     * Executes an SQL INSERT request
     * 
     * @param {*} query 
     * @param {*} params 
     * @returns The number of rows inserted
     */
    async insert_items(query, params = []) {
        result = await this.send_sql(query, params);

        return result.affectedRows;
    }
};

/**
 * For mocking
 * 
 * @param {*} db 
 */
function set_db_connection(db) {
    the_db = db;
}

/**
 * Get a connection to the MySQL database
 * 
 * @returns An SQL connection object or mock object
 */
function get_db_connection() {
    if (the_db) {
        return the_db;
    }
    the_db = new RelationalDB();
    return the_db;
}



export {
    get_db_connection,
    set_db_connection,
    RelationalDB
}

