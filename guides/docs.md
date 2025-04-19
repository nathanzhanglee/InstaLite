For each new page:
1. Add route to routes.js
2. Add route to App.tsx

To run frontend, go to frontend directory and run:
```npm run dev --host```

Go to localhost:4567/[page]

## Database information
[create_tables.js](/backend/models/create_tables.js) (```npm run db:create-tables``` from the project root directory) assumes that you locally have the 'names' table from IMDB available with data, as per Ed #591
If you don't, try to follow the instructions from HW2/3 to get one available locally.
Once you do, an easy way to move it over is by running the following commands in the terminal:
```
service mysql start
msql < setup.sql
mysqldump imdb_basic names > names_table_dump.sql
mysql instalite < names_table_dump.sql
```
Note that you can run ```service mysql stop``` to end the session, and also that you should only have to run ```mysql < setup.sql``` once overall, as the database and user creation only need to happen once.

After changes are made to the schema design (or if you just want to reset the database tables), you can run ```npm run db:delete-tables``` from the project root directory. Remember to run the table creation command again after that!

## Running rankings and Spark
```mvn clean install``` in root directory.