/*
*This is auto generated from the ControlManifest.Input.xml file
*/

// Define IInputs and IOutputs Type. They should match with ControlManifest.
export interface IInputs {
    arrowsJson: ComponentFramework.PropertyTypes.StringProperty;
    quadrantTopLeft: ComponentFramework.PropertyTypes.StringProperty;
    quadrantTopRight: ComponentFramework.PropertyTypes.StringProperty;
    quadrantBottomLeft: ComponentFramework.PropertyTypes.StringProperty;
    quadrantBottomRight: ComponentFramework.PropertyTypes.StringProperty;
    xAxisLabel: ComponentFramework.PropertyTypes.StringProperty;
    yAxisLabel: ComponentFramework.PropertyTypes.StringProperty;
}
export interface IOutputs {
    arrowsJson?: string;
}
