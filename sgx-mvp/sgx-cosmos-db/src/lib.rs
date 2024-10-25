use mongodb::{
    bson::{doc, oid::ObjectId, Document},
    options::ClientOptions,
    Client,
};
use serde_json::Value;
use anyhow::{anyhow, Result};
use bson;

/// Asynchronously reads a JSON schema from MongoDB using the `_id` field
pub async fn read_json_schema_from_mongodb(
    object_id: &str,
    database_name: &str,
    collection_name: &str,
    cosmosdb_uri: &str,
) -> Result<Value> {
    // Set up the MongoDB client options
    let mut client_options = ClientOptions::parse(cosmosdb_uri)
        .await
        .map_err(|e| anyhow!("Failed to parse MongoDB URI: {}", e))?;
    client_options.app_name = Some("mongodb-sgx-client".to_string());

    // Get a handle to the deployment
    let client = Client::with_options(client_options)
        .map_err(|e| anyhow!("Failed to create MongoDB client: {}", e))?;

    // Access the database and collection
    let db = client.database(database_name);
    let collection: mongodb::Collection<Document> = db.collection(collection_name);

    // Convert the provided object_id string into an ObjectId
    let object_id = ObjectId::parse_str(object_id)
        .map_err(|e| anyhow!("Failed to parse ObjectId '{}': {}", object_id, e))?;

    // Find the document with the specified _id
    let mut schema_doc = collection
        .find_one(doc! { "_id": object_id })
        .await
        .map_err(|e| anyhow!("Failed to execute find_one: {}", e))?
        .ok_or_else(|| anyhow!("No document found with _id: {}", object_id))?;

    schema_doc.remove("_id"); // Remove the _id field from the document

    // Convert the BSON document to serde_json::Value
    let schema_json: Value = bson::from_bson(bson::Bson::Document(schema_doc))
        .map_err(|e| anyhow!("Failed to convert BSON to JSON: {}", e))?;

    Ok(schema_json)
}
