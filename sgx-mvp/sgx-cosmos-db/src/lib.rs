use mongodb::{bson::{doc, oid::ObjectId, Document}, Client, options::ClientOptions};
use serde_json::Value;
use std::error::Error;

/// Asynchronously reads a JSON schema from MongoDB using the `_id` field
pub async fn read_json_schema_from_mongodb(object_id: &str, database_name: &str, collection_name: &str, cosmosdb_uri: &str) -> Result<Value, Box<dyn Error>> {
    // Set up the MongoDB client options
    let mut client_options = ClientOptions::parse(cosmosdb_uri).await?;
    client_options.app_name = Some("mongodb-sgx-client".to_string());

    // Get a handle to the deployment
    let client = Client::with_options(client_options)?;

    // Access the database and collection
    let db = client.database(database_name);
    let collection: mongodb::Collection<Document> = db.collection(collection_name);

    // Convert the provided object_id string into an ObjectId
    let object_id = ObjectId::parse_str(object_id)?;

    // Find the document with the specified _id
    let schema_doc = collection
        .find_one(doc! { "_id": object_id })  // Use _id to search for the document
        .await?;

    // Handle the case where the document is not found
    let mut schema_doc = match schema_doc {
        Some(doc) => doc,
        None => {
            eprintln!("[!] No document found with _id: {}", object_id);
            return Err("Document not found".into());
        }
    };

    schema_doc.remove("_id");  // Remove the _id field from the document

    // Convert the BSON document to serde_json::Value
    let schema_json: Value = serde_json::to_value(&schema_doc)?;

    Ok(schema_json)
}