import Ajv from "ajv";
const ajv = new Ajv();

export default {
  methods: {
    async validateSchema(schema) {
      const validate = await ajv.validateSchema(schema);
      return {
        success: validate,
        error: ajv.errorsText(ajv.errors)
      };
    },
    async validateJsonDataAgainstSchema(dataFile, schemaFile) {
      const data = await this.readAsText(dataFile);
      const schema = await this.readAsText(schemaFile);

      const validate = ajv.compile(JSON.parse(schema));

      const result = {
        success: validate(JSON.parse(data)),
        error: ajv.errorsText(validate.errors)
      };

      if (!result.success) {
        this.$bvToast.toast(result.error, {
          title: "Error",
          variant: "danger",
          solid: true
        });
      }

      return result;
    },
    readAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    }
  }
};
