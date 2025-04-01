# Hosting on AWS

Here are some recommended "best practices" for deploying your project on EC2.  Really, you are just trying to mirror your container.

## Basic Setup

Launch an EC2 node (suggested: a Medium node in either the t-series or m-series) with Ubuntu 22.04 to match your Docker container.  You should be able to use it almost identically to your Docker container.

Make sure you select the Default VPC (virtual private cloud) to make sure it's able to talk with your RDS instance (if you're using Amazon RDS).

Go into the Security Groups and enable SSH (Port 22), Port 4567, 8080 and whatever you are using for your application. You can enable all of these for "All IPv4 addresses".

You may need to run `sudo apt install` to add various packages.  You can find most of these in your Dockerfile and in the various homework instructions you've used up to this point (e.g., for ChromaDB).

You can also use `scp` to copy files from your local machine to your EC2 instance. If you prefer a graphical tool: on MacOS there is https://panic.com/transmit/ and on Windows there is https://winscp.net/eng/index.php.

You can copy your source code using `scp`.  But instead you'll probably want to set up a custom `ssh` keypair for your project, so you can just `git clone` it. You can follow instructions such as these or these.

If you want to allow all of your teammates to log into the EC2 node, you can have them send you their ssh public keys (`id_rsa.pub` file or equivalent).  You can scp these to the EC2 machine and then `cat id_rsa.pub >> ~/.ssh/authorized_keys` (or the like, changing `id_rsa.pub`'s name as appropriate).

## Chroma and Kafka Access

You'll want to log into multiple sessions via ssh, including:

1. ChromaDB (chroma will need to run).

2. Tunnel to Kafka (as you do with your container -- you'll copy the appropriate PEM file here). You may need to sudo nano /etc/hosts and add 127.0.0.1 ip-172-31-29-52

You should not need a tunnel to RDS or to EMR if you are in the same VPC. Under that configuration, you would connect to the Amazon "internal" IP address like ip-172-something-something-something instead of localhost.  However, if you prefer for consistency, you can use the tunnel setup from your Ubuntu EC2 instance as well, and connect via localhost.

## EMR

If you are using EMR, make sure it also is in the same Default VPC as your EC2 instance, or else set up a tunnel.

## EC2 and the Learning Lab

Two things to keep in mind:

1. When your Lab expires, the RDS and EC2 nodes will automatically shut down.  However if you restart the lab they should be automatically restarted.  The only issue is they'll likely have different IP addresses.

2. When the Lab is still running, you can click on Start Lab again to extend the lab past its 4 hours.

### Tunnel Server

Now we will create a *tunnel* to this instance.  The tunnel needs to go through your EMR coordinator node, so **it will change each time you re-launch the Lab and start EMR**.  You will likely also need to update your Security Group each time you launch EMR, to add your new IP address.

```
ssh -i ~/.ssh/nets_2120_remote_keypair.pem -L 3306:rdsDNS:3306 hadoop@publicDNS
```

where rdsDNS is the Endpoint address above, and publicDNS is the DNS name of your EMR cluster as before.

