/*global chrome*/
import React, { Component } from 'react';
import './App.css';
import 'typeface-roboto';
import Button from '@material-ui/core/Button';
import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import TextField from '@material-ui/core/TextField';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import axios from 'axios'
import { APP_ID, APP_KEY } from "./secrets";

class App extends Component {
  constructor() {
    super();
    this.state = {
      checked: true,
      wordToLookUp: '',
      russianLettersToEnglish: {
        'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't',
        'н': 'y', 'г': 'u', 'ш': 'i', 'щ': 'o', 'з': 'p',
        'ф': 'a', 'ы': 's', 'в': 'd', 'а': 'f', 'п': 'g',
        'р': 'h', 'о': 'j', 'л': 'k', 'д': 'l', 'я': 'z',
        'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n',
        'ь': 'm'
      },
      wordDefinitions: null,
      found: null,
      derivativeOf: null
    }

    chrome.tabs.executeScript(null, { file: 'content.js' }, () => {
      // If you try and inject into an extensions page
      // or the webstore/NTP you'll get an error.
      if (chrome.runtime.lastError) {
        alert('There was an error injecting script: \n'
          + chrome.runtime.lastError.message);
      }
    });
  }

  componentDidMount() {
    chrome.runtime.onMessage.addListener(request => {
      if (request.action === 'selectedText') {
        console.log('message')
        this.setState({wordToLookUp: request.source});
        this.lookUpButtonHandler();
      }
    });
  }

  languageOnChange(event) {
    this.setState({checked: event.target.checked});
  }

  wordOnChange(event) {
    const convertRussianLetterToEnglishIfNecessary = word => {
      const newlyAddedLetter = word[word.length - 1];
      if (newlyAddedLetter === undefined) {
        return '';
      }

      const lowerCaseLetter = newlyAddedLetter.toLowerCase();
     
      const convertedLetter = this.state.russianLettersToEnglish[lowerCaseLetter] ? 
        this.state.russianLettersToEnglish[lowerCaseLetter] : lowerCaseLetter
      return word.substring(0, word.length - 1) + convertedLetter;
    }
    
    this.setState({wordToLookUp: convertRussianLetterToEnglishIfNecessary(event.target.value)});
  }

  convertAllLettersToEnglishLowerCase() {
    const lowerCaseWord = this.state.wordToLookUp.toLowerCase();
    const convertedWord = lowerCaseWord.split('').map(letter => 
      this.state.russianLettersToEnglish[letter] ? 
        this.state.russianLettersToEnglish[letter] : letter).join('');
    
    if (convertedWord !== this.state.wordToLookUp) {
      this.setState({wordToLookUp: convertedWord});
    }
  }

  processJson(rawEntries) {
    const allEntries = [];

    for (let sectionDefinition of rawEntries) {
      const partOfSpeech = sectionDefinition.lexicalCategory;

      const transitivity = sectionDefinition.grammaticalFeatures ?
        sectionDefinition.grammaticalFeatures[0].text
        : null;

      let linkToAudio;
      if (sectionDefinition.pronunciations) {
        const pronunciationsAudio = sectionDefinition.pronunciations.find(
          obj => obj.audioFile);
        linkToAudio = pronunciationsAudio ?
          pronunciationsAudio.audioFile : null;
      }

      const entries = sectionDefinition.entries;
      for (let entry of entries) {
        const rawSenses = entry.senses;
        const senses = [];
        for (let sense of rawSenses) {
          const definition = sense.definitions ?
            sense.definitions[0] : sense.crossReferenceMarkers;

          const examples = sense.examples;
          const registers = sense.registers;

          let subSenses = [];
          if (sense.subsenses) {
            for (let subSense of sense.subsenses) {
              const definition = subSense.definitions ?
                subSense.definitions[0] :
                subSense.crossReferenceMarkers;

              const examples = subSense.examples;
              const regions = subSense.regions;
              const registers = subSense.registers;

              subSenses.push({definition, regions, registers});
            }
          }

          senses.push({definition, subSenses, registers});
        }

        allEntries.push({
          partOfSpeech, senses, linkToAudio,
          transitivity, otherSpellings: entry.variantForms
        });
      }
    }

    return allEntries;
  }

  async lookUpButtonHandler() {
    if (this.state.wordToLookUp === '') {
      return;
    }
    this.convertAllLettersToEnglishLowerCase();

    const region = this.state.checked ? 'us' : 'gb';
    const lookUpUrl = 'https://od-api.oxforddictionaries.com:443/api/v1/' +
      `entries/en/${this.state.wordToLookUp}/regions=${region}`;
    
    let response;
    try {
      response = await axios.get(lookUpUrl, {
        headers: {
          app_id: APP_ID,
          app_key: APP_KEY
        }
      });
    } catch (error) {
      if (error.response) {
        if (error.response.status === 404) {
          this.setState({found: false})
          this.setState({derivativeOf: null})
          return;
        }
        alert(`Bad response from server! Status: ${error.response.status}`);
        return
      } else if (error.request) {
        alert('No response from server!');
        console.error(`No response from server. Error: ${error.request}`);
        return;
      } else {
        alert('Error with setting up a request!')
        console.error(`Error with setting up a request. Error: ${error.message}`);
        return;
      }
    }
    
    const json = response.data.results[0].lexicalEntries;
    if (json[0].derivativeOf) {
      this.setState({found: false})
      this.setState({derivativeOf: json[0].derivativeOf[0].text})
    } else {
      this.setState({
        wordDefinitions: this.processJson(json)
      });

      // Change state to null and then to true 
      // to trigger remount of WordDefinitions component.
      this.setState({found: null});
      this.setState({found: true})
    }
  }

  enterInInputHandler(event) {
    const enterButtonCode = 13;
    if (event.keyCode === enterButtonCode) {
      this.lookUpButtonHandler();
    }
  }

  render() {
    return (
      <div className="App">
        <Header 
          checked={this.state.checked} 
          languageOnChange={event => this.languageOnChange(event)} 
          wordToLookUp={this.state.wordToLookUp}
          wordOnChange={event => this.wordOnChange(event)}
          lookUpButtonHandler={() => this.lookUpButtonHandler()}
          enterInInputHandler={event => this.enterInInputHandler(event)}
        />
        {this.state.found === true ?
          <WordDefinitions 
            word={this.state.wordToLookUp} 
            region={this.state.checked ? 'American' : 'British'}
            wordDefinitions={this.state.wordDefinitions}
          />
          : null
        }
        {this.state.found === false ?
          <NotFound derivativeOf={this.state.derivativeOf}/>
          : null
        }
      </div>
    );
  }
}

const Header = ({checked, languageOnChange, wordToLookUp, wordOnChange,
                 lookUpButtonHandler, enterInInputHandler}) => (
  <AppBar color="default">
    <Toolbar>
      <FormGroup>
        <FormControlLabel
          control={
            <Switch checked={checked} onChange={languageOnChange}
              color="primary" />
          }
          label={checked ? 'US' : 'UK'}
        />
      </FormGroup>
      <TextField
        value={wordToLookUp}
        onChange={wordOnChange}
        margin="normal"
        autoFocus
        onKeyUp={enterInInputHandler}
      />
      <Button variant="contained" color="primary" 
              onClick={lookUpButtonHandler}>
        Define
      </Button>
    </Toolbar>
  </AppBar>
);

const NotFound = ({ derivativeOf }) => (
  <div id="not-found">
    <h2>
      Couldn't find word!
    </h2>
    {derivativeOf ?
      <h4>
        Check: {derivativeOf}.
      </h4>
      : null
    }
  </div>
);

const Sense = ({sense}) => (
  <span class="sense">
    {sense.regions && sense.regions.length !== 0 ?
      <span class="green-text">
        {sense.regions.join(', ') + ' '}
      </span>
      : null}
    {sense.registers && sense.registers.length !== 0 ?
      <span class="green-text">
        {sense.registers.join(', ') + ' '}
      </span>
      : null}
    {sense.definition}
  </span> 
);

class WordDefinitions extends Component {
  constructor({word, region, wordDefinitions}) {
    super();
    this.audioElements = [];
    this.state = {
      word,
      region,
      wordDefinitions
    }
  }

  componentDidMount() {
    window.scroll(0, 0);
    this.setAudioHandlers();
  }

  setAudioHandlers() {
    this.audioElements.forEach(audioElement => {
      audioElement.onclick = function () {
        this.firstElementChild.play();
      }
    });
  }

  render() {
    return (
      <div id="word-definitions">
        <header>
          <ul id="breadcrumb">
            <li>{this.state.region}</li>
            <li>{this.state.word}</li>
          </ul>
        </header>

        {this.state.wordDefinitions.map(entry => 
          <section>
            <span class="part-of-speech">{entry.partOfSpeech}</span>

            {entry.linkToAudio ?
              <span class="audio" ref={el => this.audioElements.push(el)}>
                <audio src={entry.linkToAudio} />
                <img src="play.png" />
              </span>
              : null}

            {entry.otherSpellings && entry.otherSpellings.length !== 0 ?
              <div class="variant">
                (
                {entry.otherSpellings.map((variantForm, index) => {
                  const result = [];

                  if (variantForm.regions && variantForm.regions.length !== 0) {
                    result.push(variantForm.regions.map((region, i) => [
                        <em>{region}</em>, 
                        i < variantForm.regions.length - 1 && ', '
                      ])
                    ) 
                  } else {
                    result.push(<em>also </em>);
                  }
                  
                  if (index === entry.otherSpellings.length - 1) {
                    result.push(<strong>{variantForm.text}</strong>);
                  } else {
                    result.push(<strong>{variantForm.text};</strong>);
                  }

                  return result;
                }
                )}
                )
              </div>
              : null}
            {entry.transitivity ? 
              <div class="transitivity">
                Transitivity: {entry.transitivity}
              </div>
              : null}
            
            <ol class="senses">
              {entry.senses.map(sense => 
                <li>
                  <Sense sense={sense} />
                  {sense.subSenses && sense.subSenses.length !== 0 ?
                    <ol>
                      {sense.subSenses.map(subSense =>
                        <li>
                          <Sense sense={subSense} />
                        </li>)}
                    </ol>
                    : null}
                </li>)}
            </ol>
          </section>
        )}
      </div> 
    );
  }
}

export default App;
