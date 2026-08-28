import AsyncStorage from "@react-native-async-storage/async-storage"
import uuid from "react-native-uuid";
const STORAGE_KEY="credentials";
export interface Credential{
    id:string,
    key:string,
    value:string,
    category:string
};
export interface AddCredential{
    key:string,
    value:string,
    category:string
};
export const CredentialStorage = {
    getAll: async function(): Promise<Credential[]>{
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    },
    getByKey: async function(id:string):Promise<Credential | undefined>{
        const allCredentials:Credential[] = await this.getAll();
        const credential:Credential | undefined = allCredentials.find((credential:Credential)=> credential.id === id)
        return credential;
    },
    add: async function(credentialToAdd:AddCredential): Promise<Credential[]>{
        const allCredentials:Credential[] =await this.getAll();
        const newCredential:Credential = {
            id: uuid.v4().toString(),
            key: credentialToAdd.key,
            value: credentialToAdd.value,
            category: credentialToAdd.category
        };
        allCredentials.push(newCredential);
        await AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(allCredentials));
        return allCredentials;
    },
    update: async function(credentialToUpdate:Credential): Promise<Credential[]>{
        const allCredentials: Credential[] = await this.getAll();
        const idx = allCredentials.findIndex((credential:Credential)=>credential.id === credentialToUpdate.id);
        allCredentials[idx]=credentialToUpdate;
        await AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(allCredentials));
        return allCredentials;
    },
    deleteById: async function(id:string): Promise<Credential[]>{
        const allCredentials:Credential[] = await this.getAll();
        const updatedCredentials: Credential[] = allCredentials.filter((credential:Credential) => credential.id !== id);
        await AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(updatedCredentials));
        return updatedCredentials;
    }
}