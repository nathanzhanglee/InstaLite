-- Active: 1744679969311@@127.0.0.1@3306@instalite
create database if not exists instalite;
create user if not exists 'admin1' identified by 'password';
grant all privileges on instalite.* to 'admin1';
\q