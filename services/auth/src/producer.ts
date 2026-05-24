import {Kafka,Producer,Admin} from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();
let producer:Producer;
let admin:Admin;

export const connectKafka=async()=>{
    try{
       const kafka = new Kafka({
        clientId: 'auth-service',
        brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
         }) ;
         admin=kafka.admin();

         await admin.connect();
          
         const topics = await admin.listTopics();
            if(!topics.includes('send-mail')){
               await admin.createTopics({
                 topics: [
                 {
                 topic: 'send-mail',
                 numPartitions: 1,
                 replicationFactor: 1,
              }
          ]
        });

     console.log("✅ Topic ensured");
            }

            await admin.disconnect();
            producer = kafka.producer();
            await producer.connect();
                console.log(" ✅ Kafka producer connected successfully");

    }
    catch(error){
        console.error("Fail to connect to Kafka:", error);
    }
}

export const publishToTopic=async(topic:string,message:any)=>{
    
        if(!producer){  
            console.log("Kafka producer not initialized");
            return;
        }
        try{
        await producer.send({
            topic,
            messages: [
                { value: JSON.stringify(message) }
            ]
        });
        console.log(`✅ Message published to topic: ${topic}`);
    } catch (error) {
        console.error("Fail to publish message to Kafka:", error);
    }
};

export const disconnectKafka=async()=>{
    
        if(producer){ 
            producer.disconnect();
        }
    };      