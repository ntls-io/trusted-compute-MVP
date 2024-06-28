import Ajv from 'ajv';

export const validateMixin = {
    methods: {
        validateDataAgainstSchema(data, schema) {
            const ajv = new Ajv();
            const validate = ajv.compile(schema);
            return { success: validate(data), error: ajv.errorsText(validate.errors) }
        },
    },
};
