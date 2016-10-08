define(['knockout', 'viewModels/field-factory', 'tinycolor', 'fabricjs-textStyles'], function(ko, FieldFactory, tinycolor, styles) {
  /**
   * ViewModel representing a Card and its data.
   * @param  {editableFieldVM table} List of fields used to create the cards
   */
  function cardVM(jsonEditableFields, sharedConfiguration) {
    var self = this;

    /*****************************
     *** Variables Declaration ***
     *****************************/

    self._fields = ko.observableArray([]);
    self.componentsFields = ko.observableArray([]);

    self.cardName = ko.pureComputed(function() {
      var nameFieldExists = false;
      for (var iField = 0; iField < self._fields().length; iField++) {
        var field = self._fields()[iField];
        if (field.isNameField) {
          return self._getValue(field.name);
        } else if (field.name == 'name') {
          nameFieldExists = true;
        }
      }
      if (nameFieldExists == true) {
        return self._getValue('name');
      } else {
        return self._getValue(self._fields()[0].name);
      }
    });

    /************************
     *** Public functions ***
     ************************/
     self.updateFields = function(fieldList, sharedConfiguration) {
       var fields = [];

       // Creation of the EditableFieldVM
       for (var iField = 0; iField < fieldList.length; iField++) {
         var editableField = FieldFactory.buildField(fieldList[iField], sharedConfiguration);
         // Getting previous values from actual field with same name
         var existingField = self._getFieldFromName(editableField.name);
         if (existingField != null) {
           editableField.setValue(existingField.getJsonValue());
         }
         fields.push(editableField);
       }

       // List of fields to be used as Components
       var componentsFields = [];
       for (var iField = 0; iField < fields.length; iField++) {
         var componentField =
         {
           name: fields[iField].getComponentName(),
           params: fields[iField]
         };
         componentsFields.push(componentField);
       }

       // Filling the Observable Arrays
       self.componentsFields(componentsFields);
       self._fields(fields);
     }

     /* Returns the Card Data as Json object, ready to be saved and then loaded later */
     self.getSavedData = function() {
       var savedObject = { "data": { }, "conf": { } };
       // Retrieving the data
       for (var iField = 0; iField < self._fields().length; iField++) {
         var field = self._fields()[iField];
         savedObject.data[field.name] = field.getJsonValue();
       }
       // Retrieving the card configuration
       savedObject.conf.styleKey = '';
       return savedObject;
     }

     /* Load data from Json Values */
     self.loadFromJson = function(jsonCard) {
       // Compatibility with version before 0.1.2
       if ((jsonCard.data == undefined) || (jsonCard.conf == undefined)) {
         self._loadCardData(jsonCard);
       }
       else
       {
         self._loadCardData(jsonCard.data);
       }
     }

     /* Processing the content of a field to get a value */
     self.processString = function(processedString) {

       // TODO : better match code with the possible variables names (Regex ?)
       if (processedString.indexOf('?') == 0) {
         var valueField = processedString.replace('?', '');
         return self._getBoolValue(valueField);
       } else if (processedString.indexOf('££') == 0) {
         var valueField = processedString.replace('££', '');
         var formattedText = self.processString(valueField);
         return styles.generateStylesFromFormattedText(formattedText);
       } else if (processedString.indexOf('£') == 0) {
         var valueField = processedString.replace('£', '');
         return self._getStyles(valueField);
       } else if (processedString.indexOf('&') == 0) {
         var valueField = processedString.replace('&', '');
         return self._getNumericValue(valueField);
       }

       // A string that is encapsulated by {{myString}} has to be evaluated as code
       var regexFindCode = /^\{\{(.*)\}\}$/g;
       var matchCode = regexFindCode.exec(processedString);
       if (matchCode != null) {
         var evaluatedCode = matchCode[0];
         var value = null;
         var regexBasic = /card\[([a-zA-Z0-9_]*)\]/g;
         evaluatedCode = evaluatedCode.replace(regexBasic, function(match, p1, offset, string) { return "self._getValue('" + p1 + "')"});
         try
         {
           eval(evaluatedCode);
         }
         catch(err) {
           console.log("Error when evaluating a 'code variable' from the template : " + err.message);
         }
         return (value != null) ? value : ''; // Maybe setting to default value of the field (need each FabricJS property to be known)
       }

       // Replacing the occurences of $variable$ by the content of the variable (text only)
       // For options fields, return the Text value.
       //                     $variable.value$ returns the stored value,
       //                     $variable.text$ returns the displayed text value
       // For Rich Text Fields, returns the text without formatting
       //                       $variable.html$ returns the html text
       //                       $variable.text$ returns the text without formatting
       var regexReplace = /\$([a-zA-Z0-9_][a-zA-Z0-9_\.]*[a-zA-Z0-9_])\$/g;
       var matchReplace = null; //regexReplace.exec(processedString);
       var replacedString = processedString;
       var hasBeenProcessed = false;
       while ((matchReplace = regexReplace.exec(processedString)) !== null) {
         var replacedElement = matchReplace[0];
         // Standard value or specific value (.value, .text, .html, ...)
         var fieldName = matchReplace[1];
         var valueType = 'text';
         var indexOfPoint = matchReplace[1].indexOf('.');
         if (indexOfPoint > 0) {
           fieldName = matchReplace[1].substring(0, indexOfPoint);
           valueType = matchReplace[1].substring(indexOfPoint + 1);
         }
         var replacingValue = '';
         var field = self._getFieldFromName(fieldName);
         if (field != null) {
           replacingValue = field.getAdvancedValue(valueType);
         }
         replacedString = replacedString.replace(replacedElement, replacingValue);

         hasBeenProcessed = true;
       }
       if (hasBeenProcessed) { return replacedString; }

       if (processedString.indexOf('$') == 0) {
         var valueField = processedString.replace('$', '');
         return self._getValue(valueField);
       }

       return processedString;
     }

    /*************************
     *** Private Functions ***
     *************************/

    self._getFieldFromName = function(fieldName) {
      for (var iField = 0; iField < self._fields().length; iField++) {
        var field = self._fields()[iField];
        if (field.name == fieldName) {
          return field;
        }
      }
      return null;
    }

    self._getValue = function(fieldName) {
      var field = self._getFieldFromName(fieldName);
      if (field != null) {
        // Some fields can have a specific return value for code
        var fieldValue = null;
        if (field.getCodeValue !== undefined) {
          fieldValue = field.getCodeValue();
        } else {
          fieldValue = field.getJsonValue();
        }
        if ((fieldValue != null) && (fieldValue != undefined)) {
          return fieldValue;
        }
      }
      return '';
    }

    self._getBoolValue = function(fieldName) {
      var field = self._getFieldFromName(fieldName);
      if (field != null) {
          return field.checkedValue();
      }
      return false;
    }

    self._getNumericValue = function(fieldName) {
      var field = self._getFieldFromName(fieldName);
      if ((field != null) && field.isNumeric()) {
          var numericVal = field.numericValue();
          if (((numericVal == null) || (numericVal == undefined) || (numericVal == "")) && (field.default != undefined)) {
            numericVal = field.default;
          }

          return numericVal;
      }
      return false;
    }

    self._getStyles = function(fieldName) {
      var field = self._getFieldFromName(fieldName);
      if ((field != null) && (field.styles != undefined)) {
        return field.styles();
      } else {
        return { };
      }
    }

    /* Managing the data and conf stored in the object */
    self._loadCardData = function(jsonData){
      for (var data in jsonData) {
        var field = self._getFieldFromName(data);
        if (field != null) {
          field.setValue(jsonData[data]);
        }
      }
    }
    self._loadCardConf = function(jsonConf) {
      self._setStyleKey(jsonConf.styleKey);
    }
    self._setStyleKey = function(key) {

    }

    /*****************************
     *** Object initialization ***
     *****************************/
     self.updateFields(jsonEditableFields, sharedConfiguration);
  }

  return {
    newCardVM: function(jsonEditableFields, sharedConfiguration)
      { return new cardVM(jsonEditableFields, sharedConfiguration); }
  }
});
