-- Active: 1744679969311@@127.0.0.1@3306@instalite
create database if not exists instalite;
create user if not exists 'admin' identified by '80w9b243UBA*Xv!UnXSA%is';
grant all privileges on instalite.* to 'admin';
\q